'use client';
import { useState, useEffect } from 'react';
export default function Admin(){
  const [products,setProducts]=useState([]);
  const [orders,setOrders]=useState([]);
  const [tab,setTab]=useState('products');
  useEffect(()=>{ fetch('http://localhost:4000/api/admin/products',{headers:{Authorization:'Bearer demo'}}).then(r=>r.json()).then(d=>setProducts(d.products||[])).catch(()=>{}); },[]);
  return (<div style={{display:'flex', fontFamily:'sans-serif'}}><aside style={{width:220, background:'#111', color:'#fff', minHeight:'100vh', padding:16}}><h2>CommerceCore Admin</h2>{['Dashboard','Products','Orders','Customers','Discounts','Themes','Apps','Settings'].map(t=>(<div key={t} onClick={()=>setTab(t.toLowerCase())} style={{padding:8, cursor:'pointer', background: tab===t.toLowerCase()?'#333':'transparent'}}>{t}</div>))}</aside><main style={{flex:1, padding:24}}><h1>{tab}</h1>{tab==='products' && products.map(p=>(<div key={p.id} style={{border:'1px solid #ddd', padding:12, marginBottom:8}}><b>{p.title}</b> - ${p.variants?.[0]?.price}</div>))}<p style={{marginTop:20, color:'#666'}}>Demo admin - connect to backend for live data. Login: admin@demo.com / Admin123!</p></main></div>);
}
