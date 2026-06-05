"use client";
import { supabase } from "../supabase";
import { useState, useEffect, useRef } from "react";

const ADMIN_USER = "joud11";
const ADMIN_PASS = "joud202611";

type Order = {
  id: number; created_at: string; customer_name: string; phone: string;
  address: string; notes?: string; total_price: number; items: any[];
  status: string; payment_method: string; transfer_image_url?: string;
  denial_reason?: string; country_code?: string;
};
type Product = {
  id: number; name: string; nameAr: string; emoji: string; image_url?: string;
  price: number; original_price?: number; discount: number; desc: string; descAr: string; category: string;
};

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  pending:   { en: "Pending",   ar: "قيد الانتظار" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  shipped:   { en: "Shipped",   ar: "تم الشحن" },
  delivered: { en: "Delivered", ar: "تم التسليم" },
  denied:    { en: "Denied",    ar: "مرفوض" },
};

const STATUS_FLOW: Record<string, string> = {
  pending: "confirmed", confirmed: "shipped", shipped: "delivered",
};

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<"orders"|"products">("orders");
  const [dark, setDark] = useState(false); const [lang, setLang] = useState<"en"|"ar">("en");
  const [toast, setToast] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false); const [editingProduct, setEditingProduct] = useState<Product|null>(null);
  const [pName, setPName] = useState(""); const [pNameAr, setPNameAr] = useState(""); const [pEmoji, setPEmoji] = useState("🪔");
  const [pImageFile, setPImageFile] = useState<File|null>(null); const [pImagePreview, setPImagePreview] = useState(""); const [pImageUploading, setPImageUploading] = useState(false);
  const [pPrice, setPPrice] = useState(""); const [pDiscount, setPDiscount] = useState("0");
  const [pDesc, setPDesc] = useState(""); const [pDescAr, setPDescAr] = useState(""); const [pCategory, setPCategory] = useState("perfume");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState("all");
  const [denyModal, setDenyModal] = useState<{id:number,phone:string}|null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<number|null>(null);

  const bg = dark?"#0D0D0D":"#F7F4EF"; const cardBg = dark?"#161616":"#FFFFFF";
  const border = dark?"#252525":"#E5DDD0"; const text = dark?"#EDE8E0":"#1C1510";
  const textSub = "#7A6A58"; const accent = "#8B6F47"; const navBg = dark?"#080808":"#1C1510";
  const inp = { width:"100%", padding:"11px 14px", background:dark?"#1E1E1E":"#FDFAF6", border:`1px solid ${border}`, color:text, fontFamily:"Jost,sans-serif", fontSize:14, outline:"none", boxSizing:"border-box" as const };

  useEffect(() => { if (isAuthenticated) { fetchProducts(); fetchOrders(); } }, [isAuthenticated]);
  const showMsg = (m:string) => { setToast(m); setTimeout(()=>setToast(""),2500); };
  const fetchProducts = async () => { const {data}=await supabase.from("products").select("*").order("id",{ascending:true}); if(data) setProducts(data); };
  const fetchOrders = async () => { const {data}=await supabase.from("orders").select("*").order("id",{ascending:false}); if(data) setOrders(data); };

  const handleLogin = (e:React.FormEvent) => {
    e.preventDefault();
    if(username===ADMIN_USER && password===ADMIN_PASS){setIsAuthenticated(true);setLoginError("");}
    else setLoginError(lang==="ar"?"اسم المستخدم أو كلمة المرور غير صحيحة":"Wrong username or password");
  };

  const resetForm = () => { setPName("");setPNameAr("");setPEmoji("🪔");setPPrice("");setPDiscount("0");setPDesc("");setPDescAr("");setPCategory("perfume");setPImageFile(null);setPImagePreview("");setEditingProduct(null);setShowForm(false); };
  const startEdit = (p:Product) => { setEditingProduct(p);setPName(p.name);setPNameAr(p.nameAr);setPEmoji(p.emoji||"🪔");setPPrice(String(p.price));setPDiscount(String(p.discount));setPDesc(p.desc);setPDescAr(p.descAr);setPCategory(p.category);setPImagePreview(p.image_url||"");setPImageFile(null);setShowForm(true); };

  const uploadImage = async (file:File):Promise<string|null> => {
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path=`products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const {error}=await supabase.storage.from("product-images").upload(path,file,{upsert:true,contentType:file.type});
    if(error){showMsg("Upload failed: "+error.message);return null;}
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  };

  const origPrice = parseFloat(pPrice)||0;
  const discountPct = parseFloat(pDiscount)||0;
  const finalPrice = discountPct>0 ? +(origPrice*(1-discountPct/100)).toFixed(3) : origPrice;

  const handleSaveProduct = async (e:React.FormEvent) => {
    e.preventDefault();
    if(!pName||!pPrice){showMsg("Name and price required");return;}
    let image_url = pImagePreview&&!pImagePreview.startsWith("data:")?pImagePreview:(editingProduct?.image_url||"");
    if(pImageFile){setPImageUploading(true);const url=await uploadImage(pImageFile);setPImageUploading(false);if(!url)return;image_url=url;}
    const payload={name:pName,nameAr:pNameAr,emoji:pEmoji,image_url,price:finalPrice,original_price:origPrice,discount:discountPct,desc:pDesc,descAr:pDescAr,category:pCategory};
    if(editingProduct){const{error}=await supabase.from("products").update(payload).eq("id",editingProduct.id);if(!error){showMsg("Updated!");fetchProducts();resetForm();}else showMsg(error.message);}
    else{const{error}=await supabase.from("products").insert([payload]);if(!error){showMsg("Added!");fetchProducts();resetForm();}else showMsg(error.message);}
  };

  const handleDeleteProduct = async (id:number) => {
    if(!confirm(lang==="ar"?"حذف هذا المنتج؟":"Delete this product?"))return;
    const{error}=await supabase.from("products").delete().eq("id",id);
    if(!error){showMsg("Deleted");fetchProducts();}
  };

  // Advance order to next status
  const advanceStatus = async (order:Order) => {
    const next = STATUS_FLOW[order.status];
    if(!next)return;
    await supabase.from("orders").update({status:next}).eq("id",order.id);
    showMsg(`Moved to ${next}`); fetchOrders();
  };

  const approveOrder = async (id:number) => {
    await supabase.from("orders").update({status:"confirmed"}).eq("id",id);
    showMsg(lang==="ar"?"تم قبول الطلب":"Order approved"); fetchOrders();
  };

  const denyOrder = async () => {
    if(!denyModal)return;
    await supabase.from("orders").update({status:"denied",denial_reason:denyReason}).eq("id",denyModal.id);
    showMsg(lang==="ar"?"تم رفض الطلب":"Order denied"); setDenyModal(null); setDenyReason(""); fetchOrders();
  };

  const filteredOrders = orderFilter==="all" ? orders : orders.filter(o=>o.status===orderFilter);
  const revenue = orders.filter(o=>o.status==="delivered").reduce((s,o)=>s+(o.total_price||0),0);
  const pending = orders.filter(o=>o.status==="pending").length;

  const sc: Record<string,{bg:string;text:string}> = {
    pending:   {bg:dark?"#2A1800":"#FEF3C7",text:"#F59E0B"},
    confirmed: {bg:dark?"#001830":"#DBEAFE",text:"#3B82F6"},
    shipped:   {bg:dark?"#002010":"#D1FAE5",text:"#10B981"},
    delivered: {bg:dark?"#1A0030":"#F3E8FF",text:"#8B5CF6"},
    denied:    {bg:dark?"#2A0000":"#FEF2F2",text:"#EF4444"},
  };

  if(!isAuthenticated) return (
    <div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Jost,sans-serif",direction:lang==="ar"?"rtl":"ltr"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <div style={{position:"fixed",top:20,right:20,display:"flex",gap:8}}>
        <button onClick={()=>setLang(l=>l==="en"?"ar":"en")} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"6px 16px",fontSize:11,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="en"?"العربية":"English"}</button>
        <button onClick={()=>setDark(d=>!d)} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"6px 12px",fontSize:14,cursor:"pointer"}}>{dark?"☀️":"🌙"}</button>
      </div>
      <form onSubmit={handleLogin} style={{background:cardBg,border:`1px solid ${border}`,padding:"52px 44px",width:380,textAlign:"center"}}>
        <p style={{fontSize:10,letterSpacing:4,textTransform:"uppercase",color:accent,marginBottom:10}}>{lang==="ar"?"بوابة الإدارة":"Admin Portal"}</p>
        <h1 style={{fontFamily:"Cormorant Garamond,serif",fontSize:34,fontWeight:300,color:text,marginBottom:6,letterSpacing:2}}>JOUD·OUD</h1>
        <p style={{fontSize:12,color:textSub,marginBottom:32}}>{lang==="ar"?"سجّل دخولك":"Sign in to manage your store"}</p>
        <input value={username} onChange={e=>{setUsername(e.target.value);setLoginError("");}} placeholder={lang==="ar"?"اسم المستخدم":"Username"} style={{...inp,marginBottom:12}} />
        <input type="password" value={password} onChange={e=>{setPassword(e.target.value);setLoginError("");}} placeholder={lang==="ar"?"كلمة المرور":"Password"} style={{...inp,marginBottom:loginError?0:18}} />
        {loginError&&<div style={{background:"#FEF2F2",border:"1px solid #FCA5A5",color:"#B91C1C",padding:"10px 14px",fontSize:12,marginTop:10,marginBottom:14,textAlign:lang==="ar"?"right":"left"}}>⚠️ {loginError}</div>}
        <button type="submit" style={{width:"100%",background:"#1C1510",color:"#E8DFD0",border:"none",padding:15,fontSize:11,letterSpacing:3,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",marginTop:4}}>{lang==="ar"?"دخول":"Sign In"}</button>
      </form>
    </div>
  );

  return (
    <div style={{fontFamily:"Jost,sans-serif",background:bg,minHeight:"100vh",color:text,direction:lang==="ar"?"rtl":"ltr"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <nav style={{background:navBg,height:64,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 32px",position:"sticky",top:0,zIndex:100}}>
        <span style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,color:"#E8DFD0",letterSpacing:3}}>JOUD·OUD</span>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <button onClick={()=>setLang(l=>l==="en"?"ar":"en")} style={{background:"transparent",border:"1px solid #6A5A48",color:"#D4C4B0",padding:"7px 16px",fontSize:12,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:500}}>{lang==="en"?"العربية":"English"}</button>
          <button onClick={()=>setDark(d=>!d)} style={{background:"transparent",border:"1px solid #6A5A48",color:"#D4C4B0",padding:"7px 12px",fontSize:16,cursor:"pointer"}}>{dark?"☀️":"🌙"}</button>
          <button onClick={()=>setIsAuthenticated(false)} style={{background:"transparent",border:"1px solid #6A5A48",color:"#D4C4B0",padding:"7px 20px",fontSize:12,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:500}}>{lang==="ar"?"خروج":"Logout"}</button>
        </div>
      </nav>

      <div style={{maxWidth:1280,margin:"0 auto",padding:"40px 32px"}}>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:36}}>
          {[
            {label:lang==="ar"?"إجمالي الطلبات":"Total Orders",value:String(orders.length),color:text},
            {label:lang==="ar"?"قيد الانتظار":"Pending",value:String(pending),color:"#F59E0B"},
            {label:lang==="ar"?"الإيرادات":"Revenue",value:revenue.toFixed(3),suffix:" JOD",color:"#22C55E"},
            {label:lang==="ar"?"المنتجات":"Products",value:String(products.length),color:text},
          ].map(s=>(
            <div key={s.label} style={{background:cardBg,border:`1px solid ${border}`,padding:"22px 26px"}}>
              <p style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 10px"}}>{s.label}</p>
              <p style={{fontFamily:"Cormorant Garamond,serif",fontSize:34,color:s.color,margin:0,lineHeight:1}}>
                {s.value}{s.suffix&&<span style={{fontSize:14,fontFamily:"Jost,sans-serif",marginLeft:4,opacity:0.7}}>{s.suffix}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:`2px solid ${border}`,marginBottom:28}}>
          {(["orders","products"] as const).map(t=>(
            <button key={t} onClick={()=>setActiveTab(t)} style={{background:"none",border:"none",borderBottom:activeTab===t?`3px solid ${accent}`:"3px solid transparent",padding:"14px 32px",fontSize:12,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",color:activeTab===t?text:textSub,fontFamily:"Jost,sans-serif",marginBottom:-2,fontWeight:activeTab===t?600:400}}>
              {t==="orders"?(lang==="ar"?"الطلبات":"Orders"):(lang==="ar"?"المنتجات":"Products")}
            </button>
          ))}
        </div>

        {/* ── ORDERS ── */}
        {activeTab==="orders"&&(
          <div>
            {/* Filter pills */}
            <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
              {["all","pending","confirmed","shipped","delivered","denied"].map(f=>(
                <button key={f} onClick={()=>setOrderFilter(f)} style={{background:orderFilter===f?accent:"transparent",color:orderFilter===f?"#fff":textSub,border:`1px solid ${orderFilter===f?accent:border}`,padding:"7px 18px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                  {f==="all"?(lang==="ar"?"الكل":"All"):(lang==="ar"?STATUS_LABELS[f]?.ar:STATUS_LABELS[f]?.en)||f}
                </button>
              ))}
            </div>

            {!filteredOrders.length
              ? <div style={{background:cardBg,border:`1px solid ${border}`,padding:80,textAlign:"center",color:textSub,fontSize:14}}>{lang==="ar"?"لا توجد طلبات":"No orders yet"}</div>
              : <div style={{display:"grid",gap:14}}>
                  {filteredOrders.map(order=>{
                    const s=sc[order.status]||sc.pending;
                    const label=lang==="ar"?STATUS_LABELS[order.status]?.ar||order.status:STATUS_LABELS[order.status]?.en||order.status;
                    const isExpanded=expandedOrder===order.id;
                    const nextStatus=STATUS_FLOW[order.status];
                    return (
                      <div key={order.id} style={{background:cardBg,border:`1px solid ${border}`,borderLeft:lang==="ar"?"none":`4px solid ${s.text}`,borderRight:lang==="ar"?`4px solid ${s.text}`:"none"}}>
                        {/* Order header */}
                        <div style={{padding:"20px 24px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}} onClick={()=>setExpandedOrder(isExpanded?null:order.id)}>
                          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                            <span style={{fontFamily:"Cormorant Garamond,serif",fontSize:18,color:text}}>#{order.id} — {order.customer_name}</span>
                            <span style={{background:s.bg,color:s.text,padding:"3px 10px",fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:600}}>{label}</span>
                            <span style={{background:dark?"#1E1E1E":"#F7F2EA",border:`1px solid ${border}`,color:textSub,padding:"3px 10px",fontSize:10,textTransform:"uppercase"}}>{order.payment_method==="cliq"?"CliQ":"WhatsApp"}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:14}}>
                            <span style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,color:"#22C55E"}}>{order.total_price} <span style={{fontSize:12,fontFamily:"Jost,sans-serif",opacity:0.7}}>JOD</span></span>
                            <span style={{color:textSub,fontSize:18}}>{isExpanded?"▲":"▼"}</span>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded&&(
                          <div style={{padding:"0 24px 20px",borderTop:`1px solid ${border}`}}>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:16,marginBottom:16}}>
                              <div>
                                <p style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 4px"}}>{lang==="ar"?"العميل":"Customer"}</p>
                                <p style={{fontSize:14,color:text,margin:0}}>{order.customer_name}</p>
                              </div>
                              <div>
                                <p style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 4px"}}>{lang==="ar"?"الهاتف":"Phone"}</p>
                                <p style={{fontSize:14,color:text,margin:0}}>{order.phone}</p>
                              </div>
                              <div>
                                <p style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 4px"}}>{lang==="ar"?"العنوان":"Address"}</p>
                                <p style={{fontSize:14,color:text,margin:0}}>{order.address}</p>
                              </div>
                              <div>
                                <p style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 4px"}}>{lang==="ar"?"التاريخ":"Date"}</p>
                                <p style={{fontSize:13,color:textSub,margin:0}}>{new Date(order.created_at).toLocaleString(lang==="ar"?"ar-JO":"en-GB")}</p>
                              </div>
                              {order.notes&&<div style={{gridColumn:"1/-1"}}>
                                <p style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 4px"}}>{lang==="ar"?"ملاحظات":"Notes"}</p>
                                <p style={{fontSize:13,color:text,margin:0}}>{order.notes}</p>
                              </div>}
                            </div>

                            {/* Items */}
                            <div style={{marginBottom:16}}>
                              <p style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 8px"}}>{lang==="ar"?"المنتجات":"Items"}</p>
                              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                                {order.items?.map((item:any,i:number)=>(
                                  <span key={i} style={{background:dark?"#1E1E1E":"#F7F2EA",border:`1px solid ${border}`,padding:"5px 12px",fontSize:12,color:textSub}}>
                                    {item.nameAr&&lang==="ar"?item.nameAr:item.name} × {item.qty||item.quantity||1} — {((item.price||0)*(item.qty||item.quantity||1)).toFixed(3)} JOD
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Transfer screenshot for CliQ */}
                            {order.transfer_image_url&&(
                              <div style={{marginBottom:16}}>
                                <p style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 8px"}}>{lang==="ar"?"لقطة التحويل":"Transfer Screenshot"}</p>
                                <a href={order.transfer_image_url} target="_blank" rel="noopener noreferrer">
                                  <img src={order.transfer_image_url} alt="transfer" style={{maxWidth:280,maxHeight:180,objectFit:"contain",border:`1px solid ${border}`,cursor:"pointer"}} />
                                </a>
                              </div>
                            )}

                            {/* Denial reason */}
                            {order.status==="denied"&&order.denial_reason&&(
                              <div style={{background:dark?"#2A0000":"#FEF2F2",border:"1px solid #FCA5A5",padding:"12px 16px",marginBottom:16}}>
                                <p style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"#EF4444",margin:"0 0 4px"}}>{lang==="ar"?"سبب الرفض":"Denial Reason"}</p>
                                <p style={{fontSize:13,color:"#EF4444",margin:0}}>{order.denial_reason}</p>
                                <p style={{fontSize:11,color:"#EF4444",margin:"6px 0 0",opacity:0.8}}>{lang==="ar"?"رقم العميل للتواصل:":"Contact customer:"} {order.phone}</p>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:8}}>
                              {/* Pending: Approve or Deny */}
                              {order.status==="pending"&&<>
                                <button onClick={()=>approveOrder(order.id)} style={{background:"#22C55E",color:"#fff",border:"none",padding:"9px 22px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>
                                  {lang==="ar"?"✓ قبول":"✓ Approve"}
                                </button>
                                <button onClick={()=>setDenyModal({id:order.id,phone:order.phone})} style={{background:dark?"#2A0000":"#FEF2F2",border:"1px solid #EF4444",color:"#EF4444",padding:"9px 22px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>
                                  {lang==="ar"?"✕ رفض":"✕ Deny"}
                                </button>
                              </>}
                              {/* Advance to next step */}
                              {nextStatus&&order.status!=="pending"&&(
                                <button onClick={()=>advanceStatus(order)} style={{background:accent,color:"#fff",border:"none",padding:"9px 22px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>
                                  {lang==="ar"?`→ ${STATUS_LABELS[nextStatus]?.ar}`:`→ ${STATUS_LABELS[nextStatus]?.en}`}
                                </button>
                              )}
                              {/* WhatsApp */}
                              <button onClick={()=>window.open(`https://wa.me/${order.phone.replace(/\D/g,"")}?text=${encodeURIComponent("Hello "+order.customer_name+"! Regarding your Joud Oud order #"+order.id+" 🌿")}`, "_blank")} style={{background:"#25D366",color:"#fff",border:"none",padding:"9px 18px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",letterSpacing:1}}>
                                WhatsApp
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}

        {/* ── PRODUCTS ── */}
        {activeTab==="products"&&(
          <div>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:18}}>
              {!showForm&&<button onClick={()=>{resetForm();setShowForm(true);}} style={{background:"#1C1510",color:"#E8DFD0",border:"none",padding:"12px 28px",fontSize:11,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="ar"?"+ إضافة منتج":"+ Add Product"}</button>}
            </div>

            {showForm&&(
              <form onSubmit={handleSaveProduct} style={{background:cardBg,border:`2px solid ${accent}`,padding:"32px 36px",marginBottom:24}}>
                <h3 style={{fontFamily:"Cormorant Garamond,serif",fontSize:24,fontWeight:300,color:text,marginBottom:24,marginTop:0}}>
                  {editingProduct?(lang==="ar"?"تعديل المنتج":"Edit Product"):(lang==="ar"?"إضافة منتج جديد":"Add New Product")}
                </h3>
                {/* Image upload */}
                <div style={{marginBottom:18}}>
                  <label style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:7,display:"block"}}>{lang==="ar"?"صورة المنتج":"Product Image"}</label>
                  <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                    {pImagePreview
                      ? <div style={{position:"relative",width:90,height:90,flexShrink:0}}><img src={pImagePreview} alt="preview" style={{width:90,height:90,objectFit:"cover",border:`1px solid ${border}`}} /><button type="button" onClick={()=>{setPImagePreview("");setPImageFile(null);}} style={{position:"absolute",top:-8,right:-8,background:"#EF4444",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button></div>
                      : <div onClick={()=>fileInputRef.current?.click()} style={{width:90,height:90,border:`2px dashed ${border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:textSub,fontSize:11,gap:4,flexShrink:0}}><span style={{fontSize:22}}>📷</span><span>{lang==="ar"?"رفع":"Upload"}</span></div>
                    }
                    <div style={{flex:1}}>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;setPImageFile(f);const r=new FileReader();r.onload=ev=>setPImagePreview(ev.target?.result as string);r.readAsDataURL(f);}} style={{display:"none"}} />
                      <button type="button" onClick={()=>fileInputRef.current?.click()} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"7px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",letterSpacing:1}}>{lang==="ar"?"اختر صورة":"Choose Image"}</button>
                      <p style={{fontSize:11,color:textSub,marginTop:6}}>PNG/JPG · 800×800px</p>
                      {!pImagePreview&&<div style={{display:"flex",alignItems:"center",gap:7,marginTop:5}}><span style={{fontSize:11,color:textSub}}>{lang==="ar"?"إيموجي:":"or emoji:"}</span><input value={pEmoji} onChange={e=>setPEmoji(e.target.value)} style={{...inp,width:54,textAlign:"center",fontSize:20,padding:"3px 6px"}} /></div>}
                    </div>
                  </div>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>
                  {[{l:lang==="ar"?"الاسم (إنجليزي)":"Name (EN)",v:pName,s:setPName,ph:"Oud Al Layl"},{l:lang==="ar"?"الاسم (عربي)":"Name (AR)",v:pNameAr,s:setPNameAr,ph:"عود الليل"}].map(f=>(
                    <div key={f.l}><label style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{f.l}</label><input value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.ph} style={inp} /></div>
                  ))}
                  <div>
                    <label style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"الفئة":"Category"}</label>
                    <select value={pCategory} onChange={e=>setPCategory(e.target.value)} style={{...inp}}><option value="perfume">{lang==="ar"?"عطور":"Perfume"}</option><option value="accessory">{lang==="ar"?"إكسسوارات":"Accessory"}</option></select>
                  </div>
                </div>

                {/* Price + discount */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>
                  <div><label style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"السعر الأصلي (JOD)":"Original Price (JOD)"}</label><input value={pPrice} onChange={e=>setPPrice(e.target.value)} placeholder="28" type="number" step="0.001" style={inp} /></div>
                  <div><label style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"الخصم %":"Discount %"}</label><input value={pDiscount} onChange={e=>setPDiscount(e.target.value)} placeholder="0" type="number" min="0" max="100" style={inp} /></div>
                  <div>
                    <label style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"السعر النهائي":"Final Price"}</label>
                    <div style={{...inp,background:dark?"#111":"#F0EBE3",display:"flex",alignItems:"center",gap:7}}>
                      {discountPct>0&&<span style={{textDecoration:"line-through",color:textSub,fontSize:12}}>{origPrice.toFixed(3)}</span>}
                      <span style={{color:"#22C55E",fontWeight:700}}>{finalPrice.toFixed(3)} JOD</span>
                      {discountPct>0&&<span style={{background:"#22C55E",color:"#fff",padding:"2px 6px",fontSize:10,fontWeight:700,marginLeft:"auto"}}>-{discountPct}%</span>}
                    </div>
                  </div>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
                  {[{l:lang==="ar"?"الوصف (إنجليزي)":"Description (EN)",v:pDesc,s:setPDesc,ph:"Product description...",dir:"ltr"},{l:lang==="ar"?"الوصف (عربي)":"Description (AR)",v:pDescAr,s:setPDescAr,ph:"وصف المنتج...",dir:"rtl"}].map(f=>(
                    <div key={f.l}><label style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{f.l}</label><textarea value={f.v} onChange={e=>f.s(e.target.value)} rows={3} placeholder={f.ph} dir={f.dir} style={{...inp,resize:"vertical" as const}} /></div>
                  ))}
                </div>

                <div style={{display:"flex",gap:10}}>
                  <button type="submit" disabled={pImageUploading} style={{background:pImageUploading?"#555":"#1C1510",color:"#E8DFD0",border:"none",padding:"12px 32px",fontSize:11,letterSpacing:2,textTransform:"uppercase",cursor:pImageUploading?"not-allowed":"pointer",fontFamily:"Jost,sans-serif"}}>
                    {pImageUploading?(lang==="ar"?"جاري الرفع...":"Uploading..."):editingProduct?(lang==="ar"?"حفظ":"Save Changes"):(lang==="ar"?"إضافة":"Add Product")}
                  </button>
                  <button type="button" onClick={resetForm} style={{background:"transparent",color:textSub,border:`1px solid ${border}`,padding:"12px 22px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="ar"?"إلغاء":"Cancel"}</button>
                </div>
              </form>
            )}

            <div style={{background:cardBg,border:`1px solid ${border}`,overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{borderBottom:`2px solid ${border}`}}>
                  {(lang==="ar"?["","الاسم","العربي","الفئة","السعر","الخصم","الإجراءات"]:["","Name","Arabic","Category","Price","Discount","Actions"]).map(h=>(
                    <th key={h} style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,padding:"14px 16px",textAlign:lang==="ar"?"right":"left",fontWeight:500,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {products.map(p=>{
                    const hasDiscount=p.discount>0;
                    const orig=p.original_price||p.price;
                    return (
                      <tr key={p.id} style={{borderBottom:`1px solid ${border}`}}>
                        <td style={{padding:"12px 16px",width:68}}>{p.image_url?<img src={p.image_url} alt="" style={{width:52,height:52,objectFit:"cover",border:`1px solid ${border}`,display:"block"}} />:<span style={{fontSize:24,display:"block",textAlign:"center"}}>{p.emoji||"🪔"}</span>}</td>
                        <td style={{padding:"12px 16px"}}><strong style={{fontSize:14,color:text,display:"block"}}>{p.name}</strong><span style={{fontSize:11,color:textSub}}>{(p.desc||"").substring(0,40)}{(p.desc?.length||0)>40?"…":""}</span></td>
                        <td style={{padding:"12px 16px",fontSize:14,direction:"rtl",color:text,textAlign:"center"}}>{p.nameAr}</td>
                        <td style={{padding:"12px 16px"}}><span style={{background:p.category==="perfume"?(dark?"#2A1800":"#FEF9EC"):(dark?"#001830":"#EEF2FF"),color:p.category==="perfume"?"#D97706":"#6366F1",padding:"4px 10px",fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>{p.category}</span></td>
                        <td style={{padding:"12px 16px",whiteSpace:"nowrap"}}>
                          {hasDiscount&&<span style={{textDecoration:"line-through",color:textSub,fontSize:12,display:"block"}}>{orig} JOD</span>}
                          <span style={{fontWeight:700,fontSize:14,color:"#22C55E"}}>{p.price} JOD</span>
                        </td>
                        <td style={{padding:"12px 16px"}}>{hasDiscount?<span style={{background:dark?"#002A00":"#DCFCE7",color:"#22C55E",padding:"3px 9px",fontSize:11,fontWeight:700}}>{p.discount}% OFF</span>:<span style={{color:textSub,fontSize:12}}>—</span>}</td>
                        <td style={{padding:"12px 16px",whiteSpace:"nowrap"}}>
                          <button onClick={()=>startEdit(p)} style={{background:dark?"#2A2000":"#FEF9EC",border:`1px solid ${accent}`,color:accent,padding:"7px 16px",fontSize:11,cursor:"pointer",marginRight:8,fontFamily:"Jost,sans-serif",fontWeight:600,letterSpacing:1}}>{lang==="ar"?"تعديل":"Edit"}</button>
                          <button onClick={()=>handleDeleteProduct(p.id)} style={{background:dark?"#2A0000":"#FEF2F2",border:"1px solid #EF4444",color:"#EF4444",padding:"7px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600,letterSpacing:1}}>{lang==="ar"?"حذف":"Delete"}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── DENY MODAL ── */}
      {denyModal&&(
        <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(0,0,0,0.6)"}}>
          <div style={{background:cardBg,border:`1px solid ${border}`,padding:"32px 36px",width:"100%",maxWidth:420}}>
            <h3 style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:300,color:text,marginBottom:6,marginTop:0}}>{lang==="ar"?"رفض الطلب":"Deny Order"}</h3>
            <p style={{fontSize:12,color:textSub,marginBottom:16}}>{lang==="ar"?"سيتم إرسال سبب الرفض مع رقم هاتف العميل للتواصل":"Customer phone for refund contact:"} <strong style={{color:text}}>{denyModal.phone}</strong></p>
            <label style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:6,display:"block"}}>{lang==="ar"?"سبب الرفض *":"Reason for denial *"}</label>
            <select value={denyReason} onChange={e=>setDenyReason(e.target.value)} style={{...inp,marginBottom:16}}>
              <option value="">{lang==="ar"?"-- اختر سببًا --":"-- Select reason --"}</option>
              <option value={lang==="ar"?"المنتج غير متوفر حاليًا":"Product currently out of stock"}>{lang==="ar"?"المنتج غير متوفر":"Product out of stock"}</option>
              <option value={lang==="ar"?"العنوان خارج منطقة التوصيل":"Address outside delivery area"}>{lang==="ar"?"خارج منطقة التوصيل":"Outside delivery area"}</option>
              <option value={lang==="ar"?"التحويل غير مكتمل أو غير صحيح":"Transfer incomplete or incorrect"}>{lang==="ar"?"مشكلة في التحويل":"Transfer issue"}</option>
              <option value={lang==="ar"?"سبب آخر":"Other"}>{lang==="ar"?"سبب آخر":"Other"}</option>
            </select>
            <div style={{display:"flex",gap:10}}>
              <button onClick={denyOrder} disabled={!denyReason} style={{background:!denyReason?"#555":"#EF4444",color:"#fff",border:"none",padding:"11px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:!denyReason?"not-allowed":"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="ar"?"تأكيد الرفض":"Confirm Deny"}</button>
              <button onClick={()=>{setDenyModal(null);setDenyReason("");}} style={{background:"transparent",color:textSub,border:`1px solid ${border}`,padding:"11px 20px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="ar"?"إلغاء":"Cancel"}</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"#1C1510",color:"#E8DFD0",padding:"13px 28px",fontSize:12,letterSpacing:1,zIndex:999,border:`1px solid ${accent}`,whiteSpace:"nowrap"}}>{toast}</div>}
    </div>
  );
}
