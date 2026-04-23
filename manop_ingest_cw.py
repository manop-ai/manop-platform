#!/usr/bin/env python3
"""
manop_ingest_cw.py  — CW Real Estate full ingest for Manop
──────────────────────────────────────────────────────────────────
Handles all 3 sheets:
  Sheet 1: 'Lekki Data Collection'         → for-sale listings
  Sheet 2: 'Rental Collection Lekki phase1' → for-rent listings (Annual Rent column)
  Sheet 3: 'Shortlets'                      → short-let listings (Nightly Rate column)

Usage:
  pip install supabase pandas openpyxl --break-system-packages
  export SUPABASE_SERVICE_ROLE_KEY=your_key
  python3 manop_ingest_cw.py --file lekki_property_data_template.xlsx          # preview
  python3 manop_ingest_cw.py --file lekki_property_data_template.xlsx --live   # insert
"""

import os, sys, re, hashlib, argparse, json, urllib.request
from datetime import datetime, timezone
from collections import Counter

try:
    import pandas as pd
except ImportError:
    print("Run: pip install pandas openpyxl --break-system-packages"); sys.exit(1)
try:
    from supabase import create_client
except ImportError:
    print("Run: pip install supabase --break-system-packages"); sys.exit(1)


# ─── Config ──────────────────────────────────────────────────
SUPABASE_URL       = 'https://ftbmfjkrgcbykombxdlh.supabase.co'
SUPABASE_KEY       = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
PARTNER_SHORT_CODE = 'CW'
NOW                = datetime.now(timezone.utc).isoformat()

# ─── Live FX rates ────────────────────────────────────────────
FALLBACK_FX = {'NGN': 1570, 'GHS': 15.2, 'KES': 129, 'ZAR': 18.5, 'USD': 1}

def fetch_fx():
    try:
        with urllib.request.urlopen('https://open.er-api.com/v6/latest/USD', timeout=6) as r:
            d = json.loads(r.read())
        if d.get('result') == 'success':
            fx = {k: d['rates'].get(k, FALLBACK_FX[k]) for k in FALLBACK_FX}
            fx['USD'] = 1
            print(f"Live FX  NGN={fx['NGN']:.0f}  GHS={fx['GHS']:.2f}  KES={fx['KES']:.0f}")
            return fx
    except Exception as e:
        print(f"FX fetch failed ({e}) — using fallback")
    return dict(FALLBACK_FX)

FX = fetch_fx()

# ─── Neighborhood map ─────────────────────────────────────────
HOOD = {
    'lekki phase 1':   ('Lekki Phase 1','Lagos'),
    'lekki phase one': ('Lekki Phase 1','Lagos'),
    'lekki ph 1':      ('Lekki Phase 1','Lagos'),
    'lekki phase1':    ('Lekki Phase 1','Lagos'),
    'lekki phase 2':   ('Lekki Phase 2','Lagos'),
    'lekki':           ('Lekki','Lagos'),
    'ikoyi':           ('Ikoyi','Lagos'),
    'victoria island': ('Victoria Island','Lagos'),
    'eko atlantic':    ('Eko Atlantic','Lagos'),
    'ikota':           ('Ikota','Lagos'),
    'chevron':         ('Chevron','Lagos'),
    'ajah':            ('Ajah','Lagos'),
    'sangotedo':       ('Sangotedo','Lagos'),
    'gbagada':         ('Gbagada','Lagos'),
    'yaba':            ('Yaba','Lagos'),
    'ikeja':           ('Ikeja','Lagos'),
    'surulere':        ('Surulere','Lagos'),
    'maitama':         ('Maitama','Abuja'),
    'asokoro':         ('Asokoro','Abuja'),
    'wuse 2':          ('Wuse 2','Abuja'),
    'east legon':      ('East Legon','Accra'),
    'westlands':       ('Westlands','Nairobi'),
    'karen':           ('Karen','Nairobi'),
}

def norm_hood(raw):
    if not raw or str(raw).strip().lower() in ('nan','','none'):
        return None, None, 'unknown'
    s = str(raw).strip().lower()
    if s in HOOD:
        h, c = HOOD[s]; return h, c, 'exact'
    for k,(h,c) in HOOD.items():
        if k in s: return h, c, 'fuzzy'
    return str(raw).strip(), None, 'unknown'

# ─── Property type ────────────────────────────────────────────
PTYPE = {
    'detached duplex':'detached-duplex','semi detached duplex':'semi-detached-duplex',
    'semi-detached duplex':'semi-detached-duplex','terraced duplex':'terraced-duplex',
    'detached bungalow':'detached-bungalow','duplex':'duplex','bungalow':'bungalow',
    'flat':'apartment','apartment':'apartment','studio':'studio',
    'penthouse':'penthouse','mansion':'mansion','terraced':'terraced-house',
    'detached house':'detached-house','land':'land','maisonette':'maisonette',
}

def norm_type(raw):
    if not raw or str(raw).strip().lower() in ('nan',''): return None
    s = str(raw).strip().lower()
    for k,v in PTYPE.items():
        if k in s: return v
    return str(raw).strip().lower().replace(' ','-')

# ─── Helpers ──────────────────────────────────────────────────
def clean(v):
    s = str(v or '').strip()
    return None if s.lower() in ('nan','','none') else s

def parse_int(v):
    if v is None or (isinstance(v, float) and str(v)=='nan'): return None
    try: return int(float(str(v).strip()))
    except: return None

def parse_num(v):
    if v is None or (isinstance(v, float) and str(v)=='nan'): return None
    try: return float(str(v).replace(',','').strip())
    except: return None

def parse_price(raw):
    if raw is None or (isinstance(raw, float) and str(raw)=='nan'): return None, 'NGN'
    if isinstance(raw, (int, float)): return (int(raw) if raw > 0 else None), 'NGN'
    s = str(raw).strip().lower().replace(',','').replace(' ','')
    currency = 'USD' if ('$' in s or 'usd' in s) else 'NGN'
    m = re.search(r'([\d.]+)(b|m|k)?', s)
    if not m: return None, currency
    n = float(m.group(1))
    sx = (m.group(2) or '').lower()
    if sx == 'b': n *= 1_000_000_000
    elif sx == 'm': n *= 1_000_000
    elif sx == 'k': n *= 1_000
    if currency == 'NGN' and 0 < n < 10_000: n *= 1_000_000
    return (int(n) if n > 0 else None), currency

def to_usd(amount, currency='NGN'):
    return round(amount / FX.get(currency.upper(), 1), 2)

def make_hash(partner, neighborhood, beds, price):
    key = f"{partner}|{(neighborhood or '').lower()}|{beds or ''}|{round((price or 0)/1_000_000)}"
    return hashlib.md5(key.encode()).hexdigest()[:20]

def guess_col(df, candidates):
    for c in candidates:
        needle = c.lower().replace(' ','').replace('_','').replace('/','').replace('(','').replace(')','')
        for col in df.columns:
            hay = col.lower().replace(' ','').replace('_','').replace('/','').replace('(','').replace(')','')
            if needle == hay or needle in hay: return col
    return None


# ─── Sheet processors ─────────────────────────────────────────

def process_sale_sheet(df, sheet_name):
    """Sheet 1: for-sale listings. Price column = 'Price (NGN)'"""
    col_price   = guess_col(df, ['price ngn','price (ngn)','price','amount','asking price'])
    col_area    = guess_col(df, ['area','neighborhood','neighbourhood'])
    col_subloc  = guess_col(df, ['sub location','sublocation','street'])
    col_city    = guess_col(df, ['city state','city/state','city'])
    col_beds    = guess_col(df, ['bedrooms','bedroom','beds'])
    col_baths   = guess_col(df, ['bathrooms','bathroom','baths'])
    col_type    = guess_col(df, ['property type','propertytype','type'])
    col_size    = guess_col(df, ['land size','size','sqm','floor area','plot'])
    col_url     = guess_col(df, ['listing url','url','link'])
    col_desc    = guess_col(df, ['notes','description','details','features'])
    col_agent   = guess_col(df, ['agent name','agent','contact'])
    col_plat    = guess_col(df, ['platform source','platform','source'])

    print(f"\n  Sheet '{sheet_name}' ({len(df)} rows) — FOR SALE")
    print(f"  price={col_price}  area={col_area}  beds={col_beds}  type={col_type}")

    records, skipped, seen = [], [], set()

    for i, row in df.iterrows():
        rownum = i + 2
        price_raw = row.get(col_price) if col_price else None
        price, currency = parse_price(price_raw)
        if not price:
            skipped.append({'row': rownum, 'sheet': sheet_name, 'reason': f'No price (raw: {price_raw})'})
            continue

        area_raw  = clean(row.get(col_area)) if col_area else None
        subloc    = clean(row.get(col_subloc)) if col_subloc else None
        neighborhood, city, conf = norm_hood(area_raw)

        if not city and col_city:
            cr = clean(row.get(col_city))
            if cr: city = cr.split('/')[0].split('(')[0].strip()

        bedrooms  = parse_int(row.get(col_beds) if col_beds else None)
        bathrooms = parse_num(row.get(col_baths) if col_baths else None)
        prop_type = norm_type(row.get(col_type) if col_type else None)
        source_url= clean(row.get(col_url) if col_url else None)
        desc      = clean(row.get(col_desc) if col_desc else None)
        agent_raw = clean(row.get(col_agent) if col_agent else None)
        platform  = clean(row.get(col_plat) if col_plat else None)

        size_raw = row.get(col_size) if col_size else None
        try:
            size_sqm = float(str(size_raw).replace(',','').replace('sqm','').strip()) if size_raw and str(size_raw)!='nan' else None
            if size_sqm and (size_sqm<=0 or size_sqm>50_000): size_sqm = None
        except: size_sqm = None

        price_usd = to_usd(price, currency)

        raw_hash = make_hash(PARTNER_SHORT_CODE, neighborhood or subloc, bedrooms, price)
        if raw_hash in seen:
            skipped.append({'row': rownum, 'sheet': sheet_name, 'reason': 'duplicate within file'}); continue
        seen.add(raw_hash)

        records.append({
            'source_type': 'agent-direct', 'country_code': 'NG',
            'city': city or 'Lagos', 'neighborhood': neighborhood,
            'property_type': prop_type, 'listing_type': 'for-sale',
            'bedrooms': bedrooms, 'bathrooms': bathrooms, 'size_sqm': size_sqm,
            'price_local': price, 'currency_code': currency, 'price_usd': price_usd,
            'agent_phone': None, 'confidence': 0.90 if conf=='exact' else 0.75 if conf=='fuzzy' else 0.60,
            'raw_hash': raw_hash,
            'raw_data': {
                'source_agency': 'CW Real Estate', 'source_sheet': sheet_name,
                'source_url': source_url, 'description': desc,
                'platform_source': platform, 'sub_location': subloc,
                'agent_name': agent_raw, 'area_raw': area_raw,
                'location_confidence': conf,
                'intel': {'price_usd': price_usd, 'fx_rate': FX.get(currency,1),
                          'fx_source': 'open.er-api.com', 'computed_at': NOW},
                'imported_from': 'lekki_property_data_template.xlsx', 'imported_at': NOW,
            },
        })
    return records, skipped


def process_rental_sheet(df, sheet_name):
    """Sheet 2: for-rent listings. Price = 'Annual Rent' column"""
    col_area    = guess_col(df, ['area','neighborhood','neighbourhood'])
    col_subloc  = guess_col(df, ['sub location','sublocation'])
    col_city    = guess_col(df, ['city state','city/state','city'])
    col_beds    = guess_col(df, ['bedrooms','bedroom','beds'])
    col_baths   = guess_col(df, ['bathrooms','bathroom'])
    col_type    = guess_col(df, ['property type','propertytype','type'])
    col_annual  = guess_col(df, ['annual rent','annualrent','annual'])
    col_monthly = guess_col(df, ['monthly rent','monthlyrent','monthly'])
    col_url     = guess_col(df, ['listing url','url','link'])
    col_desc    = guess_col(df, ['notes','description','details'])
    col_agent   = guess_col(df, ['agent name','agent','contact'])
    col_furnish = guess_col(df, ['furnishing','furnished'])

    print(f"\n  Sheet '{sheet_name}' ({len(df)} rows) — FOR RENT")
    print(f"  annual_rent={col_annual}  monthly={col_monthly}  area={col_area}  beds={col_beds}")

    records, skipped, seen = [], [], set()

    for i, row in df.iterrows():
        rownum = i + 2

        # Price: use annual rent as the stored price
        annual_raw  = row.get(col_annual) if col_annual else None
        monthly_raw = row.get(col_monthly) if col_monthly else None

        annual, _  = parse_price(annual_raw)
        monthly, _ = parse_price(monthly_raw)

        # Derive missing one from the other
        if not annual and monthly: annual = int(monthly * 12)
        if not monthly and annual: monthly = int(annual / 12)

        if not annual:
            skipped.append({'row': rownum, 'sheet': sheet_name, 'reason': f'No rent (annual: {annual_raw}, monthly: {monthly_raw})'}); continue

        area_raw  = clean(row.get(col_area)) if col_area else None
        subloc    = clean(row.get(col_subloc)) if col_subloc else None
        neighborhood, city, conf = norm_hood(area_raw)
        if not city and col_city:
            cr = clean(row.get(col_city))
            if cr: city = cr.split('/')[0].split('(')[0].strip()

        bedrooms  = parse_int(row.get(col_beds) if col_beds else None)
        bathrooms = parse_num(row.get(col_baths) if col_baths else None)
        prop_type = norm_type(row.get(col_type) if col_type else None)
        source_url= clean(row.get(col_url) if col_url else None)
        desc      = clean(row.get(col_desc) if col_desc else None)
        agent_raw = clean(row.get(col_agent) if col_agent else None)
        furnish   = clean(row.get(col_furnish) if col_furnish else None)

        price_usd = to_usd(annual, 'NGN')  # store annual rent in USD for comparison

        # Compute traditional yield using real sale medians from DB
        SALE_MEDIANS = {1: 175_000_000, 2: 285_000_000, 3: 400_000_000, 4: 725_000_000, 5: 860_000_000}
        trad_yield = None
        if bedrooms and bedrooms in SALE_MEDIANS:
            trad_yield = round((annual / SALE_MEDIANS[bedrooms]) * 100, 2)

        raw_hash = make_hash(PARTNER_SHORT_CODE + '_RENT', neighborhood or subloc, bedrooms, annual)
        if raw_hash in seen:
            skipped.append({'row': rownum, 'sheet': sheet_name, 'reason': 'duplicate'}); continue
        seen.add(raw_hash)

        records.append({
            'source_type': 'agent-direct', 'country_code': 'NG',
            'city': city or 'Lagos', 'neighborhood': neighborhood,
            'property_type': prop_type, 'listing_type': 'for-rent',
            'bedrooms': bedrooms, 'bathrooms': bathrooms, 'size_sqm': None,
            'price_local': annual,    # annual rent stored as price
            'currency_code': 'NGN', 'price_usd': price_usd,
            'agent_phone': None, 'confidence': 0.90 if conf=='exact' else 0.75,
            'raw_hash': raw_hash,
            'raw_data': {
                'source_agency': 'CW Real Estate', 'source_sheet': sheet_name,
                'source_url': source_url, 'description': desc,
                'agent_name': agent_raw, 'area_raw': area_raw,
                'furnishing': furnish, 'monthly_rent': monthly,
                'location_confidence': conf,
                'intel': {
                    'traditional_yield_pct': trad_yield,
                    'annual_rent_ngn': annual, 'monthly_rent_ngn': monthly,
                    'price_usd': price_usd, 'fx_rate': FX['NGN'],
                    'fx_source': 'open.er-api.com', 'computed_at': NOW,
                },
                'imported_from': 'lekki_property_data_template.xlsx', 'imported_at': NOW,
            },
        })
    return records, skipped


def process_shortlet_sheet(df, sheet_name):
    """Sheet 3: short-let listings. Price = 'Nightly Rate'"""
    col_loc     = guess_col(df, ['location','area','neighborhood'])
    col_beds    = guess_col(df, ['bedrooms','bedroom'])
    col_baths   = guess_col(df, ['bathrooms','bathroom'])
    col_nightly = guess_col(df, ['nightly rate','nightly','night'])
    col_monthly = guess_col(df, ['monthly rate','monthly'])
    col_weekly  = guess_col(df, ['weekly rate','weekly'])
    col_occ     = guess_col(df, ['occupancy estimate','occupancy'])
    col_url     = guess_col(df, ['listing url','url'])
    col_amenity = guess_col(df, ['amenities','features'])

    print(f"\n  Sheet '{sheet_name}' ({len(df)} rows) — SHORT LET")
    print(f"  nightly={col_nightly}  location={col_loc}  beds={col_beds}")

    records, skipped, seen = [], [], set()

    for i, row in df.iterrows():
        rownum = i + 2
        nightly_raw = row.get(col_nightly) if col_nightly else None
        nightly, _  = parse_price(nightly_raw)
        if not nightly:
            skipped.append({'row': rownum, 'sheet': sheet_name, 'reason': f'No nightly rate (raw: {nightly_raw})'}); continue

        loc_raw = clean(row.get(col_loc)) if col_loc else None
        neighborhood, city, conf = norm_hood(loc_raw)
        bedrooms  = parse_int(row.get(col_beds) if col_beds else None)
        bathrooms = parse_num(row.get(col_baths) if col_baths else None)
        source_url= clean(row.get(col_url) if col_url else None)
        amenities = clean(row.get(col_amenity) if col_amenity else None)
        monthly   = parse_num(row.get(col_monthly) if col_monthly else None)
        weekly    = parse_num(row.get(col_weekly) if col_weekly else None)
        occ       = parse_num(row.get(col_occ) if col_occ else None)

        # Annual revenue at 55% occupancy
        occ_rate   = (occ or 55) / 100
        annual_rev = nightly * 365 * occ_rate
        price_usd  = to_usd(nightly, 'NGN')  # store nightly as price for STR

        # STR yield against 3-bed sale median
        SALE_MEDIANS = {1:175_000_000, 2:285_000_000, 3:400_000_000, 4:725_000_000, 5:860_000_000}
        str_yield = None
        if bedrooms and bedrooms in SALE_MEDIANS:
            str_yield = round((annual_rev / SALE_MEDIANS[bedrooms]) * 100, 2)

        raw_hash = make_hash(PARTNER_SHORT_CODE + '_STR', neighborhood, bedrooms, int(nightly))
        if raw_hash in seen:
            skipped.append({'row': rownum, 'sheet': sheet_name, 'reason': 'duplicate'}); continue
        seen.add(raw_hash)

        records.append({
            'source_type': 'agent-direct', 'country_code': 'NG',
            'city': city or 'Lagos', 'neighborhood': neighborhood,
            'property_type': None, 'listing_type': 'short-let',
            'bedrooms': bedrooms, 'bathrooms': bathrooms, 'size_sqm': None,
            'price_local': nightly,   # nightly rate stored as price
            'currency_code': 'NGN', 'price_usd': price_usd,
            'agent_phone': None, 'confidence': 0.85,
            'raw_hash': raw_hash,
            'raw_data': {
                'source_agency': 'CW Real Estate', 'source_sheet': sheet_name,
                'source_url': source_url, 'amenities': amenities,
                'nightly_rate': nightly, 'weekly_rate': weekly, 'monthly_rate': monthly,
                'occupancy_estimate_pct': occ or 55,
                'annual_revenue_estimate': round(annual_rev),
                'intel': {
                    'nightly_rate_ngn': nightly,
                    'str_gross_yield_pct': str_yield,
                    'annual_revenue_ngn': round(annual_rev),
                    'occupancy_used': occ_rate,
                    'price_usd': price_usd, 'fx_rate': FX['NGN'],
                    'computed_at': NOW,
                },
                'imported_from': 'lekki_property_data_template.xlsx', 'imported_at': NOW,
            },
        })
    return records, skipped


# ─── Main ─────────────────────────────────────────────────────
def ingest(filepath, dry_run, skip_existing=True):
    print(f"\n{'DRY RUN' if dry_run else 'LIVE'} — Manop Ingest: CW Real Estate")
    print(f"File: {filepath}\n")
    if not dry_run and not SUPABASE_KEY:
        print("ERROR: export SUPABASE_SERVICE_ROLE_KEY=your_key"); sys.exit(1)

    xl = pd.ExcelFile(filepath)
    print(f"Sheets found: {xl.sheet_names}")

    all_records, all_skipped = [], []

    for sheet_name in xl.sheet_names:
        try:
            df = xl.parse(sheet_name)
            if len(df) == 0 or len(df.columns) < 3:
                print(f"  Skipping '{sheet_name}': too few rows/columns"); continue

            sl = sheet_name.lower()
            if 'rental' in sl or 'rent' in sl:
                r, s = process_rental_sheet(df, sheet_name)
            elif 'shortlet' in sl or 'short' in sl or 'str' in sl:
                r, s = process_shortlet_sheet(df, sheet_name)
            else:
                r, s = process_sale_sheet(df, sheet_name)

            all_records.extend(r)
            all_skipped.extend(s)
        except Exception as e:
            print(f"  Error in '{sheet_name}': {e}")

    # Cross-sheet dedup
    seen, deduped, dups = set(), [], 0
    for r in all_records:
        if r['raw_hash'] in seen: dups += 1
        else: seen.add(r['raw_hash']); deduped.append(r)

    print(f"\n{'='*60}")
    print(f"Valid records:   {len(all_records)}")
    print(f"Cross-sheet dup: {dups}")
    print(f"Ready to insert: {len(deduped)}")
    print(f"Skipped:         {len(all_skipped)}")
    print(f"\nBy listing type:")
    for lt, n in Counter(r['listing_type'] for r in deduped).most_common():
        print(f"  {lt:<14} {n}")

    if all_skipped:
        print(f"\nSkipped:")
        for s in all_skipped: print(f"  [{s['sheet']}] Row {s['row']}: {s['reason']}")

    print(f"\nSample (first 6):")
    for r in deduped[:6]:
        sym = '$' if r['currency_code']=='USD' else '₦'
        pm  = r['price_local'] / (1 if r['listing_type']=='short-let' else 1_000_000)
        unit = '/night' if r['listing_type']=='short-let' else 'M'
        print(f"  {r['bedrooms'] or '?'}bed  {(r['property_type'] or r['listing_type']):<22}  "
              f"{sym}{pm:.0f}{unit}  [{r['listing_type']:<10}]  {r['neighborhood'] or 'UNKNOWN'}")

    if dry_run:
        print(f"\nDRY RUN — nothing written. Run with --live to insert.\n"); return

    # Insert
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    result = sb.table('data_partners').select('id').eq('short_code', PARTNER_SHORT_CODE).execute()
    partner_id = result.data[0]['id'] if result.data else None
    if not partner_id:
        np = sb.table('data_partners').insert({
            'name':'CW Real Estate','short_code':PARTNER_SHORT_CODE,
            'partner_type':'agency','trust_level':'agency',
            'country_codes':['NG'],'cities':['Lagos'],'active':True,
        }).execute()
        partner_id = np.data[0]['id']
    print(f"\nPartner: CW Real Estate ({partner_id})")

    # If skip_existing, get existing hashes to avoid duplicates on re-run
    existing_hashes = set()
    if skip_existing:
        try:
            ex = sb.table('properties').select('raw_hash').eq('data_partner_id', partner_id).execute()
            existing_hashes = {r['raw_hash'] for r in (ex.data or []) if r.get('raw_hash')}
            print(f"Existing records in DB: {len(existing_hashes)} (will skip duplicates)")
        except: pass

    success, failed = 0, []
    for r in deduped:
        if r['raw_hash'] in existing_hashes:
            print(f"  ↷  Already in DB: {r['neighborhood']} {r['bedrooms']}bed"); continue
        r['data_partner_id'] = partner_id
        try:
            res = sb.table('properties').insert(r).execute()
            if res.data:
                sym = '$' if r['currency_code']=='USD' else '₦'
                pm  = r['price_local'] / (1 if r['listing_type']=='short-let' else 1_000_000)
                unit = '/night' if r['listing_type']=='short-let' else 'M'
                print(f"  ✓  {r['bedrooms'] or '?'}bed  {(r['property_type'] or r['listing_type']):<22}  "
                      f"{sym}{pm:.0f}{unit}  [{r['listing_type']:<10}]  {r['neighborhood'] or 'UNKNOWN'}")
                success += 1
            else: failed.append(r['raw_hash'])
        except Exception as e:
            print(f"  ✗  {r.get('neighborhood')} {r.get('bedrooms')}bed — {str(e)[:80]}")
            failed.append(r['raw_hash'])

    print(f"\n✓ Inserted: {success}   ✗ Failed: {len(failed)}")
    if success > 0:
        print(f"\nRun the benchmark SQL next to update market intelligence.")
        print(f"View: /neighborhood/lekki-phase-1\n")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', required=True)
    parser.add_argument('--live', action='store_true')
    args = parser.parse_args()
    ingest(args.file, dry_run=not args.live)