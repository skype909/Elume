"""Explicit school-domain linker; importing it does no application/database work."""
from __future__ import annotations
import argparse, os, re
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url

_DOMAIN=re.compile(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
class LinkRefused(RuntimeError): pass
def canonical_domain(value:str)->str:
 d=(value or '').strip().lower()
 if not _DOMAIN.fullmatch(d): raise LinkRefused('refused: domain must be a bare, valid domain')
 return d
def _url(name,expected):
 raw=os.getenv(name)
 if not raw: raise LinkRefused('refused: named database URL environment variable is missing')
 url=make_url(raw)
 if url.drivername.split('+',1)[0]!='postgresql' or url.database!=expected: raise LinkRefused('refused: unexpected database')
 return url
def _one(c,sql,params,why):
 r=c.execute(text(sql),params).mappings().one_or_none()
 if not r: raise LinkRefused('refused: '+why)
 return r
def _report(c,school_id,domain,lock=False):
 suffix=' FOR UPDATE' if lock else ''
 school=_one(c,'SELECT id,name,status,seat_limit FROM schools WHERE id=:id'+suffix,{'id':school_id},'school does not exist')
 if school['status']!='active': raise LinkRefused('refused: school is not active')
 mapping=c.execute(text('SELECT id,school_id,is_active,revoked_at FROM school_email_domains WHERE domain=:d'+suffix),{'d':domain}).mappings().one_or_none()
 rows=c.execute(text("SELECT id,school_id,role,is_active,email_verified FROM users WHERE lower(regexp_replace(email, '^.*@', ''))=:d ORDER BY id"+suffix),{'d':domain}).mappings().all()
 groups={k:[] for k in ('eligible','already_linked','conflicting_other_school','inactive','unverified','non_teacher')}
 for r in rows:
  if not r['is_active']: groups['inactive'].append(r['id'])
  elif not r['email_verified']: groups['unverified'].append(r['id'])
  elif r['role']!='teacher': groups['non_teacher'].append(r['id'])
  elif r['school_id'] is None: groups['eligible'].append(r['id'])
  elif r['school_id']==school_id: groups['already_linked'].append(r['id'])
  else: groups['conflicting_other_school'].append(r['id'])
 used=c.execute(text("SELECT count(*) FROM users WHERE school_id=:id AND role='teacher' AND is_active"),{'id':school_id}).scalar_one(); avail=max(int(school['seat_limit'])-int(used),0)
 mapping_ok=mapping is None or (mapping['school_id']==school_id and mapping['is_active'] and mapping['revoked_at'] is None)
 return {'domain':domain,'school':dict(school),'mapping':None if mapping is None else dict(mapping),'seat_limit':int(school['seat_limit']),'seats_used':int(used),'seats_required':len(groups['eligible']),'available_seats':avail,**groups,'apply_permitted':mapping_ok and not groups['conflicting_other_school'] and len(groups['eligible'])<=avail}
def check(database_url:str|URL,*,expected_database,school_id,domain):
 url=make_url(database_url)
 if url.database!=expected_database: raise LinkRefused('refused: unexpected database')
 e=create_engine(url)
 try:
  with e.connect() as c:return _report(c,school_id,canonical_domain(domain))
 finally:e.dispose()
def apply(database_url:str|URL,*,expected_database,school_id,domain,actor_user_id,confirm_school_domain_link):
 if not confirm_school_domain_link: raise LinkRefused('refused: --apply requires --confirm-school-domain-link')
 url=make_url(database_url)
 if url.database!=expected_database: raise LinkRefused('refused: unexpected database')
 domain=canonical_domain(domain);e=create_engine(url)
 try:
  with e.begin() as c:
   if not c.execute(text('SELECT pg_try_advisory_xact_lock(hashtext(:d))'),{'d':domain}).scalar_one(): raise LinkRefused('refused: another domain-link transaction is active')
   _one(c,"SELECT id FROM users WHERE id=:id AND is_active AND email_verified AND role='platform_admin' FOR UPDATE",{'id':actor_user_id},'actor is not an active verified platform administrator')
   r=_report(c,school_id,domain,True);m=r['mapping']
   if m and m['school_id']!=school_id: raise LinkRefused('refused: domain belongs to another school')
   if m and (not m['is_active'] or m['revoked_at'] is not None): raise LinkRefused('refused: domain mapping is inactive or revoked')
   if r['conflicting_other_school']: raise LinkRefused('refused: matching user belongs to another school')
   if r['seats_required']>r['available_seats']: raise LinkRefused('refused: insufficient teacher seats')
   if not m:c.execute(text('INSERT INTO school_email_domains(school_id,domain,is_active,created_by_user_id) VALUES(:s,:d,TRUE,:a)'),{'s':school_id,'d':domain,'a':actor_user_id})
   for uid in r['eligible']:
    c.execute(text('UPDATE users SET school_id=:s WHERE id=:u'),{'s':school_id,'u':uid});c.execute(text("INSERT INTO school_admin_audit_log(school_id,actor_user_id,target_user_id,action) VALUES(:s,:a,:u,'school_domain_linked')"),{'s':school_id,'a':actor_user_id,'u':uid})
   return r
 finally:e.dispose()
def main():
 p=argparse.ArgumentParser();g=p.add_mutually_exclusive_group(required=True);g.add_argument('--check',action='store_true');g.add_argument('--apply',action='store_true');p.add_argument('--confirm-school-domain-link',action='store_true');p.add_argument('--school-id',type=int,required=True);p.add_argument('--domain',required=True);p.add_argument('--actor-user-id',type=int);p.add_argument('--expected-database',required=True);p.add_argument('--database-url-env',required=True);a=p.parse_args();url=_url(a.database_url_env,a.expected_database)
 if a.apply and a.actor_user_id is None:p.error('--apply requires --actor-user-id')
 r=apply(url,expected_database=a.expected_database,school_id=a.school_id,domain=a.domain,actor_user_id=a.actor_user_id,confirm_school_domain_link=a.confirm_school_domain_link) if a.apply else check(url,expected_database=a.expected_database,school_id=a.school_id,domain=a.domain);print({'domain':r['domain'],'school_id':r['school']['id'],'school_active':True,'seats_used':r['seats_used'],'seats_required':r['seats_required'],'available_seats':r['available_seats'],'apply_permitted':r['apply_permitted']});return 0
if __name__=='__main__':raise SystemExit(main())
