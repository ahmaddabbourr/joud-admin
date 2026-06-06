"use client";
import { supabase } from "../supabase";
import { useState, useEffect, useRef } from "react";

const ADMIN_USER = "joud11";
const ADMIN_PASS = "joud202611";

type Order = {
  id: number; created_at: string; customer_name: string; phone: string;
  address: string; notes?: string; total_price: number; items: any[];
  status: string; payment_method: string; transfer_image_url?: string;
  denial_reason?: string; country_code?: string; shipping_zone?: string; shipping_cost?: number;
};
type Product = {
  id: number; name: string; nameAr: string; emoji: string; image_url?: string;
  price: number; original_price?: number; discount: number; desc: string; descAr: string; category: string;
};

const STATUS_LABELS: Record<string,{en:string;ar:string}> = {
  pending:   {en:"Pending",   ar:"قيد الانتظار"},
  confirmed: {en:"Confirmed", ar:"مؤكد"},
  shipped:   {en:"Shipped",   ar:"تم الشحن"},
  delivered: {en:"Delivered", ar:"تم التسليم"},
  denied:    {en:"Denied",    ar:"مرفوض"},
};
const STATUS_FLOW: Record<string,string> = {confirmed:"shipped", shipped:"delivered"};

// Fix #2: 12-hour format
const formatTime = (iso: string) => {
  const d = new Date(iso);
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2,"0")} ${ampm}`;
};
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) + " · " + formatTime(iso);
};

// Collapsible settings card component
function SettingsCard({title,accent,cardBg,border,text,dark,children}:{title:string;accent:string;cardBg:string;border:string;text:string;dark:boolean;children:React.ReactNode}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{background:cardBg,border:`1px solid ${border}`}}>
      <div onClick={()=>setOpen(!open)} style={{padding:"16px 22px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:open?`1px solid ${border}`:"none"}}>
        <h3 style={{fontSize:12,letterSpacing:2,textTransform:"uppercase",color:accent,margin:0}}>{title}</h3>
        <span style={{color:accent,fontSize:14,transition:"transform 0.2s",transform:open?"rotate(180deg)":"rotate(0)"}}> ▼</span>
      </div>
      {open&&<div style={{padding:"18px 22px"}}>{children}</div>}
    </div>
  );
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  // Fix #7: track attempt count to show new message each time
  const [loginError, setLoginError] = useState(""); const [loginAttempts, setLoginAttempts] = useState(0);
  const [activeTab, setActiveTab] = useState<"orders"|"products"|"settings">("orders");
  const [dark, setDark] = useState(false); const [lang, setLang] = useState<"en"|"ar">("en");
  const [toast, setToast] = useState("");

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false); const [editingProduct, setEditingProduct] = useState<Product|null>(null);
  const [pName, setPName] = useState(""); const [pNameAr, setPNameAr] = useState(""); const [pEmoji, setPEmoji] = useState("🪔");
  const [pImageFile, setPImageFile] = useState<File|null>(null); const [pImagePreview, setPImagePreview] = useState(""); const [pImageUploading, setPImageUploading] = useState(false);
  const [pImageKey, setPImageKey] = useState(0); // Fix #1: reset input key
  const [pPrice, setPPrice] = useState(""); const [pDiscount, setPDiscount] = useState("0");
  const [pDesc, setPDesc] = useState(""); const [pDescAr, setPDescAr] = useState(""); const [pCategory, setPCategory] = useState("perfume");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState("all");
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set()); // Fix #5
  const [denyModal, setDenyModal] = useState<{id:number,phone:string}|null>(null);
  const [deleteModal, setDeleteModal] = useState<{type:"single"|"bulk",id?:number,count?:number}|null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<number|null>(null);

  // Settings — Fix #12: shipping fees editable
  const [shippingFees, setShippingFees] = useState({amman:0,outside:2});
  const [savingSettings, setSavingSettings] = useState(false);
  const [adminCategories, setAdminCategories] = useState<{id:number;name:string;name_ar:string;slug:string}[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatAr, setNewCatAr] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [adminReviews, setAdminReviews] = useState<{id:number;customer_name:string;rating:number;comment:string;status:string;created_at:string}[]>([]);
  const [waApproveMsg, setWaApproveMsg] = useState("Hello {name}!\nYour Joud Aloud order has been confirmed.\nTotal: {total} JOD\nOur team will contact you soon. Thank you!");
  const [waDenyMsg, setWaDenyMsg] = useState("Hello {name},\nUnfortunately, your Joud Aloud order has been denied.\nReason: {reason}.\nPlease contact us if a refund is applicable. Thank you.");

  const bg=dark?"#0D0D0D":"#F7F4EF"; const cardBg=dark?"#161616":"#FFFFFF";
  const border=dark?"#252525":"#E5DDD0"; const text=dark?"#EDE8E0":"#1C1510";
  const textSub="#7A6A58"; const accent="#8B6F47"; const navBg=dark?"#080808":"#1C1510";
  const inp={width:"100%",padding:"11px 14px",background:dark?"#1E1E1E":"#FDFAF6",border:`1px solid ${border}`,color:text,fontFamily:"Jost,sans-serif",fontSize:14,outline:"none",boxSizing:"border-box" as const};

  useEffect(()=>{if(isAuthenticated){fetchProducts();fetchOrders();fetchSettings();fetchCategories();fetchWAMessages();fetchReviews();}},[isAuthenticated]);

  // Notification sound for new orders — polls every 15 seconds
  const lastOrderCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const [bellRing, setBellRing] = useState(false);

  useEffect(()=>{
    // Create audio element with a base64 beep sound
    const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVggoqFdVxRaIG0teleQT1dj6atlGlERVuNq6SMaUFEXJCspolkP0Jckq2jiGA9QF6Ur6SHXT1CYZavooNaO0Fkl6+gf1c6QGaZsJ57VDlBaJqxnXhRN0FqnLObd044QmsAAABkYW==");
    audio.volume = 1;
    audioRef.current = audio;
  },[]);

  const playNotification = () => {
    try {
      audioRef.current?.play();
      setBellRing(true);
      setTimeout(()=>setBellRing(false), 2000);
    } catch(e) {}
  };
  useEffect(()=>{
    if(!isAuthenticated) return;
    const interval = setInterval(async()=>{
      const{data}=await supabase.from("orders").select("id",{count:"exact"}).eq("status","pending");
      const count = data?.length || 0;
      if(lastOrderCountRef.current > 0 && count > lastOrderCountRef.current) {
        playNotification();
        showMsg(lang==="ar"?"🔔 طلب جديد!":"🔔 New order received!");
        fetchOrders();
      }
      lastOrderCountRef.current = count;
    }, 15000);
    return ()=>clearInterval(interval);
  },[isAuthenticated]);
  const showMsg=(m:string)=>{setToast(m);setTimeout(()=>setToast(""),2500);};
  const fetchProducts=async()=>{const{data}=await supabase.from("products").select("*").order("id",{ascending:true});if(data)setProducts(data);};
  const fetchOrders=async()=>{const{data}=await supabase.from("orders").select("*").order("id",{ascending:false});if(data)setOrders(data);};
  const fetchCategories=async()=>{const{data}=await supabase.from("categories").select("*").order("id",{ascending:true});if(data)setAdminCategories(data);};
  const fetchReviews=async()=>{const{data}=await supabase.from("reviews").select("*").order("created_at",{ascending:false});if(data)setAdminReviews(data);};
  const fetchWAMessages=async()=>{const{data}=await supabase.from("settings").select("*").eq("key","wa_messages").single();if(data?.value){setWaApproveMsg(data.value.approve||waApproveMsg);setWaDenyMsg(data.value.deny||waDenyMsg);}};
  const fetchSettings=async()=>{const{data}=await supabase.from("settings").select("*").eq("key","shipping_fees").single();if(data?.value)setShippingFees(data.value);};

  // Fix #7: different message on each wrong attempt
  const handleLogin=(e:React.FormEvent)=>{
    e.preventDefault();
    if(username===ADMIN_USER && password===ADMIN_PASS){setIsAuthenticated(true);setLoginError("");}
    else{
      const attempts=loginAttempts+1;
      setLoginAttempts(attempts);
      const msgs_en=["Wrong username or password","Still incorrect — please try again","Incorrect credentials again","Are you sure about those details?"];
      const msgs_ar=["اسم المستخدم أو كلمة المرور غير صحيحة","لا تزال غير صحيحة، حاول مرة أخرى","بيانات خاطئة مرة أخرى","هل أنت متأكد من هذه البيانات؟"];
      const idx=Math.min(attempts-1,3);
      setLoginError(lang==="ar"?msgs_ar[idx]:msgs_en[idx]);
      setPassword("");
    }
  };

  const resetForm=()=>{setPName("");setPNameAr("");setPEmoji("🪔");setPPrice("");setPDiscount("");setPDesc("");setPDescAr("");setPCategory("perfume");setPImageFile(null);setPImagePreview("");setPImageKey(k=>k+1);setEditingProduct(null);setShowForm(false);};
  const startEdit=(p:Product)=>{setEditingProduct(p);setPName(p.name);setPNameAr(p.nameAr);setPEmoji(p.emoji||"🪔");setPPrice(String(p.price));setPDiscount(String(p.discount));setPDesc(p.desc);setPDescAr(p.descAr);setPCategory(p.category);setPImagePreview(p.image_url||"");setPImageFile(null);setPImageKey(k=>k+1);setShowForm(true);};

  const uploadImage=async(file:File):Promise<string|null>=>{
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path=`products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const{error}=await supabase.storage.from("product-images").upload(path,file,{upsert:true,contentType:file.type});
    if(error){showMsg("Upload failed: "+error.message);return null;}
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  };

  const origPrice=parseFloat(pPrice)||0;
  const discountPct=parseFloat(pDiscount)||0;
  const finalPrice=discountPct>0?+(origPrice*(1-discountPct/100)).toFixed(3):origPrice;

  const handleSaveProduct=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!pName||!pPrice){showMsg("Name and price required");return;}
    let image_url=pImagePreview&&!pImagePreview.startsWith("data:")?pImagePreview:(editingProduct?.image_url||"");
    if(pImageFile){setPImageUploading(true);const url=await uploadImage(pImageFile);setPImageUploading(false);if(!url)return;image_url=url;}
    const payload={name:pName,nameAr:pNameAr,emoji:pEmoji,image_url,price:finalPrice,original_price:origPrice,discount:discountPct,desc:pDesc,descAr:pDescAr,category:pCategory};
    if(editingProduct){const{error}=await supabase.from("products").update(payload).eq("id",editingProduct.id);if(!error){showMsg("Updated!");fetchProducts();resetForm();}else showMsg(error.message);}
    else{const{error}=await supabase.from("products").insert([payload]);if(!error){showMsg("Added!");fetchProducts();resetForm();}else showMsg(error.message);}
  };
  const handleDeleteProduct=async(id:number)=>{
    if(!confirm(lang==="ar"?"حذف هذا المنتج؟":"Delete this product?"))return;
    const{error}=await supabase.from("products").delete().eq("id",id);
    if(!error){showMsg("Deleted");fetchProducts();}
  };

  const approveOrder=async(id:number)=>{await supabase.from("orders").update({status:"confirmed"}).eq("id",id);showMsg(lang==="ar"?"تم القبول":"Approved");fetchOrders();};
  const advanceStatus=async(order:Order)=>{const next=STATUS_FLOW[order.status];if(!next)return;await supabase.from("orders").update({status:next}).eq("id",order.id);showMsg(`→ ${next}`);fetchOrders();};
  const denyOrder=async()=>{if(!denyModal)return;await supabase.from("orders").update({status:"denied",denial_reason:denyReason}).eq("id",denyModal.id);showMsg(lang==="ar"?"تم الرفض":"Denied");setDenyModal(null);setDenyReason("");fetchOrders();};

  // WhatsApp: send confirm message to customer
  const waConfirm=(order:Order)=>{
    const msg=waApproveMsg.replace(/{name}/g,order.customer_name).replace(/{total}/g,String(typeof order.total_price==="number"?order.total_price.toFixed(3):order.total_price));
    window.open(`https://wa.me/${order.phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`,"_blank");
  };
  const waDeny=(order:Order,reason:string)=>{
    const msg=waDenyMsg.replace(/{name}/g,order.customer_name).replace(/{reason}/g,reason);
    window.open(`https://wa.me/${order.phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`,"_blank");
  };
  // Delete order — uses custom modal
  const deleteOrder=(id:number)=>setDeleteModal({type:"single",id});
  const bulkDeleteStart=()=>setDeleteModal({type:"bulk",count:selectedOrders.size});
  const confirmDelete=async()=>{
    if(!deleteModal)return;
    if(deleteModal.type==="single"&&deleteModal.id){
      await supabase.from("orders").delete().eq("id",deleteModal.id);
      showMsg(lang==="ar"?"تم الحذف":"Deleted");
    } else {
      for(const id of selectedOrders)await supabase.from("orders").delete().eq("id",id);
      showMsg(`Deleted ${selectedOrders.size} orders`);clearSelection();
    }
    setDeleteModal(null);fetchOrders();
  };

  const toggleSelect=(id:number)=>{const s=new Set(selectedOrders);s.has(id)?s.delete(id):s.add(id);setSelectedOrders(s);};
  const selectAll=()=>{const ids=filteredOrders.map(o=>o.id);setSelectedOrders(new Set(ids));};
  const clearSelection=()=>setSelectedOrders(new Set());
  const bulkAdvance=async()=>{
    for(const id of selectedOrders){const o=orders.find(x=>x.id===id);if(o&&STATUS_FLOW[o.status])await supabase.from("orders").update({status:STATUS_FLOW[o.status]}).eq("id",id);}
    showMsg(`Advanced ${selectedOrders.size} orders`);fetchOrders();clearSelection();
  };

  // Fix #12: save shipping settings
  const saveSettings=async()=>{
    setSavingSettings(true);
    const{data}=await supabase.from("settings").select("*").eq("key","shipping_fees").single();
    if(data){await supabase.from("settings").update({value:shippingFees}).eq("key","shipping_fees");}
    else{await supabase.from("settings").insert([{key:"shipping_fees",value:shippingFees}]);}
    setSavingSettings(false);showMsg(lang==="ar"?"تم الحفظ":"Settings saved!");
  };

  const filteredOrders=orderFilter==="all"?orders:orders.filter(o=>o.status===orderFilter);
  const revenue=+orders.filter(o=>o.status==="delivered").reduce((s,o)=>s+(o.total_price||0),0).toFixed(3);
  const pending=orders.filter(o=>o.status==="pending").length;

  const sc:Record<string,{bg:string;text:string}>={
    pending:{bg:dark?"#2A1800":"#FEF3C7",text:"#F59E0B"},
    confirmed:{bg:dark?"#001830":"#DBEAFE",text:"#3B82F6"},
    shipped:{bg:dark?"#002010":"#D1FAE5",text:"#10B981"},
    delivered:{bg:dark?"#1A0030":"#F3E8FF",text:"#8B5CF6"},
    denied:{bg:dark?"#2A0000":"#FEF2F2",text:"#EF4444"},
  };

  if(!isAuthenticated)return(
    <div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Jost,sans-serif",direction:lang==="ar"?"rtl":"ltr"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <div style={{position:"fixed",top:20,right:20,display:"flex",gap:8}}>
        <button onClick={()=>setLang(l=>l==="en"?"ar":"en")} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"6px 16px",fontSize:11,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="en"?"العربية":"English"}</button>
        <button onClick={()=>setDark(d=>!d)} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"6px 12px",fontSize:14,cursor:"pointer"}}>{dark?"☀️":"🌙"}</button>
      </div>
      <form onSubmit={handleLogin} style={{background:cardBg,border:`1px solid ${border}`,padding:"52px 44px",width:380,textAlign:"center"}}>
        <p style={{fontSize:10,letterSpacing:4,textTransform:"uppercase",color:accent,marginBottom:10}}>{lang==="ar"?"بوابة الإدارة":"Admin Portal"}</p>
        <h1 style={{fontFamily:"Cormorant Garamond,serif",fontSize:34,fontWeight:300,color:text,marginBottom:6,letterSpacing:2}}>JOUD ALOUD</h1>
        <p style={{fontSize:12,color:textSub,marginBottom:32}}>{lang==="ar"?"سجّل دخولك":"Sign in to manage your store"}</p>
        <input value={username} onChange={e=>{setUsername(e.target.value);setLoginError("");}} placeholder={lang==="ar"?"اسم المستخدم":"Username"} style={{...inp,marginBottom:12}} />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={lang==="ar"?"كلمة المرور":"Password"} style={{...inp,marginBottom:loginError?0:18}} />
        {/* Fix #7: red error box, new message each time */}
        {loginError&&<div style={{background:"#FEF2F2",border:"1px solid #FCA5A5",color:"#B91C1C",padding:"10px 14px",fontSize:12,marginTop:10,marginBottom:14,textAlign:lang==="ar"?"right":"left"}}>⚠️ {loginError}</div>}
        <button type="submit" style={{width:"100%",background:"#1C1510",color:"#E8DFD0",border:"none",padding:15,fontSize:11,letterSpacing:3,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",marginTop:4}}>{lang==="ar"?"دخول":"Sign In"}</button>
      </form>
    </div>
  );

  return(
    <div style={{fontFamily:"Jost,sans-serif",background:bg,minHeight:"100vh",color:text,direction:lang==="ar"?"rtl":"ltr"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`@keyframes shake{0%,100%{transform:rotate(0)}20%{transform:rotate(15deg)}40%{transform:rotate(-15deg)}60%{transform:rotate(10deg)}80%{transform:rotate(-10deg)}}`}</style>
      <nav style={{background:navBg,height:64,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 32px",position:"sticky",top:0,zIndex:100}}>
        <span style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,color:"#E8DFD0",letterSpacing:3}}>JOUD ALOUD</span>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {/* Notification bell */}
          <div onClick={()=>{setActiveTab("orders");setOrderFilter("pending");}} style={{position:"relative",cursor:"pointer",padding:"7px 10px",animation:bellRing?"shake 0.5s ease":"none"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4C4B0" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            {pending>0&&<span style={{position:"absolute",top:2,right:4,background:"#EF4444",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,border:"2px solid "+navBg}}>{pending}</span>}
          </div>
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
              <p style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 10px"}}>{s.label}</p>
              <p style={{fontFamily:"Jost,sans-serif",fontSize:32,fontWeight:600,color:s.color,margin:0,lineHeight:1}}>
                {s.value}{(s as any).suffix&&<span style={{fontSize:14,fontFamily:"Jost,sans-serif",marginLeft:4,opacity:0.7}}>{(s as any).suffix}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:`2px solid ${border}`,marginBottom:28}}>
          {(["orders","products","reviews","settings"] as const).map(t=>(
            <button key={t} onClick={()=>setActiveTab(t)} style={{background:"none",border:"none",borderBottom:activeTab===t?`3px solid ${accent}`:"3px solid transparent",padding:"14px 28px",fontSize:12,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",color:activeTab===t?text:textSub,fontFamily:"Jost,sans-serif",marginBottom:-2,fontWeight:activeTab===t?600:400}}>
              {t==="orders"?(lang==="ar"?"الطلبات":"Orders"):t==="products"?(lang==="ar"?"المنتجات":"Products"):t==="reviews"?(lang==="ar"?"التقييمات":"Reviews"):(lang==="ar"?"الإعدادات":"Settings")}
            </button>
          ))}
        </div>

        {/* ── ORDERS ── */}
        {activeTab==="orders"&&(
          <div>
            {/* Filter pills */}
            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              {["all","pending","confirmed","shipped","delivered","denied"].map(f=>(
                <button key={f} onClick={()=>setOrderFilter(f)} style={{background:orderFilter===f?accent:"transparent",color:orderFilter===f?"#fff":textSub,border:`1px solid ${orderFilter===f?accent:border}`,padding:"7px 18px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                  {f==="all"?(lang==="ar"?"الكل":"All"):(lang==="ar"?STATUS_LABELS[f]?.ar:STATUS_LABELS[f]?.en)||f}
                  {f!=="all"&&<span style={{marginLeft:6,background:"rgba(255,255,255,0.2)",borderRadius:10,padding:"1px 6px",fontSize:10}}>{orders.filter(o=>o.status===f).length}</span>}
                </button>
              ))}
            </div>

            {/* Fix #5: Bulk action bar */}
            {filteredOrders.length>0&&(
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
                <button onClick={selectAll} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"6px 14px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                  {lang==="ar"?"تحديد الكل":"Select All"} ({filteredOrders.length})
                </button>
                {selectedOrders.size>0&&<>
                  <span style={{fontSize:12,color:accent,fontWeight:600}}>{selectedOrders.size} {lang==="ar"?"محدد":"selected"}</span>
                  <button onClick={bulkAdvance} style={{background:accent,color:"#fff",border:"none",padding:"6px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",letterSpacing:1}}>
                    {lang==="ar"?"تقديم الحالة للمحدد":"Advance Selected →"}
                  </button>
                  <button onClick={bulkDeleteStart} style={{background:dark?"#2A0000":"#FEF2F2",border:"1px solid #EF4444",color:"#EF4444",padding:"6px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",letterSpacing:1,fontWeight:600}}>
                    {lang==="ar"?"حذف المحدد":"Delete Selected"}
                  </button>
                  <button onClick={clearSelection} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"6px 12px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>✕</button>
                </>}
              </div>
            )}

            {!filteredOrders.length
              ?<div style={{background:cardBg,border:`1px solid ${border}`,padding:80,textAlign:"center",color:textSub,fontSize:14}}>{lang==="ar"?"لا توجد طلبات":"No orders yet"}</div>
              :<div style={{display:"grid",gap:12}}>
                {filteredOrders.map(order=>{
                  const s=sc[order.status]||sc.pending;
                  const label=lang==="ar"?STATUS_LABELS[order.status]?.ar||order.status:STATUS_LABELS[order.status]?.en||order.status;
                  const isExpanded=expandedOrder===order.id;
                  const nextStatus=STATUS_FLOW[order.status];
                  const isSelected=selectedOrders.has(order.id);
                  return(
                    <div key={order.id} style={{background:cardBg,borderTop:`1px solid ${isSelected?accent:border}`,borderBottom:`1px solid ${isSelected?accent:border}`,borderLeft:lang==="ar"?`1px solid ${isSelected?accent:border}`:`4px solid ${s.text}`,borderRight:lang==="ar"?`4px solid ${s.text}`:`1px solid ${isSelected?accent:border}`,transition:"border-color 0.2s"}}>
                      <div style={{padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                        {/* Fix #5: checkbox */}
                        <div style={{display:"flex",alignItems:"center",gap:12,flex:1}}>
                          <input type="checkbox" checked={isSelected} onChange={()=>toggleSelect(order.id)} style={{width:16,height:16,cursor:"pointer",accentColor:accent}} onClick={e=>e.stopPropagation()} />
                          <div style={{cursor:"pointer"}} onClick={()=>setExpandedOrder(isExpanded?null:order.id)}>
                            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:3}}>
                              <span style={{fontFamily:"Cormorant Garamond,serif",fontSize:17,color:text}}>#{order.id} — {order.customer_name}</span>
                              <span style={{background:s.bg,color:s.text,padding:"2px 10px",fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:600}}>{label}</span>
                              <span style={{background:dark?"#1E1E1E":"#F7F2EA",border:`1px solid ${border}`,color:textSub,padding:"2px 8px",fontSize:10,textTransform:"uppercase"}}>{order.payment_method==="cliq"?"CliQ":order.payment_method==="cash"?(lang==="ar"?"كاش":"Cash"):"WhatsApp"}</span>
                            </div>
                            {/* Fix #2: 12-hour time */}
                            <p style={{fontSize:11,color:textSub,margin:0}}>{formatDate(order.created_at)} · {order.phone}</p>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:12}}>
                          <span style={{fontFamily:"Jost,sans-serif",fontSize:20,fontWeight:700,color:"#22C55E"}}>{order.total_price.toFixed(3)} <span style={{fontSize:11,fontFamily:"Jost,sans-serif",opacity:0.7}}>JOD</span></span>
                          <span style={{color:textSub,fontSize:16,cursor:"pointer"}} onClick={()=>setExpandedOrder(isExpanded?null:order.id)}>{isExpanded?"▲":"▼"}</span>
                        </div>
                      </div>

                      {isExpanded&&(
                        <div style={{padding:"0 22px 18px",borderTop:`1px solid ${border}`}}>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:14,marginBottom:14}}>
                            {[
                              {l:lang==="ar"?"العميل":"Customer",v:order.customer_name},
                              {l:lang==="ar"?"الهاتف":"Phone",v:order.phone},
                              {l:lang==="ar"?"العنوان":"Address",v:order.address},
                              {l:lang==="ar"?"التاريخ":"Date",v:formatDate(order.created_at)},
                              ...(order.shipping_zone?[{l:lang==="ar"?"منطقة الشحن":"Shipping Zone",v:(order.shipping_zone==="amman"?(lang==="ar"?"عمان":"Amman"):(lang==="ar"?"خارج عمان":"Outside Amman"))+" — "+(order.shipping_cost===0?(lang==="ar"?"مجاني":"Free"):order.shipping_cost+" JOD")}]:[]),
                              ...(order.notes?[{l:lang==="ar"?"ملاحظات":"Notes",v:order.notes}]:[]),
                            ].map(f=>(
                              <div key={f.l}>
                                <p style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 3px"}}>{f.l}</p>
                                <p style={{fontSize:13,color:text,margin:0}}>{f.v}</p>
                              </div>
                            ))}
                          </div>

                          {/* Items */}
                          <div style={{marginBottom:14}}>
                            <p style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 8px"}}>{lang==="ar"?"المنتجات":"Items"}</p>
                            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                              {order.items?.map((item:any,i:number)=>(
                                <span key={i} style={{background:dark?"#1E1E1E":"#F7F2EA",border:`1px solid ${border}`,padding:"5px 12px",fontSize:12,color:textSub}}>
                                  {lang==="ar"&&item.nameAr?item.nameAr:item.name} × {item.qty||1} — {((item.price||0)*(item.qty||1)).toFixed(3)} JOD
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Transfer screenshot */}
                          {order.transfer_image_url&&(
                            <div style={{marginBottom:14}}>
                              <p style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 8px"}}>{lang==="ar"?"لقطة التحويل":"Transfer Screenshot"}</p>
                              <a href={order.transfer_image_url} target="_blank" rel="noopener noreferrer">
                                <img src={order.transfer_image_url} alt="transfer" style={{maxWidth:260,maxHeight:160,objectFit:"contain",border:`1px solid ${border}`,cursor:"pointer"}} />
                              </a>
                            </div>
                          )}

                          {/* Denial reason */}
                          {order.status==="denied"&&order.denial_reason&&(
                            <div style={{background:dark?"#2A0000":"#FEF2F2",border:"1px solid #FCA5A5",padding:"12px 16px",marginBottom:14}}>
                              <p style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"#EF4444",margin:"0 0 4px"}}>{lang==="ar"?"سبب الرفض":"Denial Reason"}</p>
                              <p style={{fontSize:13,color:"#EF4444",margin:"0 0 6px"}}>{order.denial_reason}</p>
                              <p style={{fontSize:11,color:"#EF4444",margin:0,opacity:0.8}}>{lang==="ar"?"رقم العميل:":"Customer:"} {order.phone}</p>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
                            {order.status==="pending"&&<>
                              <button onClick={()=>approveOrder(order.id)} style={{background:"#22C55E",color:"#fff",border:"none",padding:"9px 20px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>✓ {lang==="ar"?"قبول":"Approve"}</button>
                              <button onClick={()=>setDenyModal({id:order.id,phone:order.phone})} style={{background:dark?"#2A0000":"#FEF2F2",border:"1px solid #EF4444",color:"#EF4444",padding:"9px 20px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>✕ {lang==="ar"?"رفض":"Deny"}</button>
                            </>}
                            {nextStatus&&order.status!=="pending"&&(
                              <button onClick={()=>advanceStatus(order)} style={{background:accent,color:"#fff",border:"none",padding:"9px 20px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>
                                → {lang==="ar"?STATUS_LABELS[nextStatus]?.ar:STATUS_LABELS[nextStatus]?.en}
                              </button>
                            )}
                            {/* WhatsApp — sends contextual message */}
                            {order.status==="confirmed"&&(
                              <button onClick={()=>waConfirm(order)} style={{background:"#25D366",color:"#fff",border:"none",padding:"9px 20px",fontSize:11,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                {lang==="ar"?"إرسال تأكيد":"Send Confirmation"}
                              </button>
                            )}
                            {order.status==="denied"&&order.denial_reason&&(
                              <button onClick={()=>waDeny(order,order.denial_reason||"")} style={{background:"#25D366",color:"#fff",border:"none",padding:"9px 20px",fontSize:11,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                {lang==="ar"?"إبلاغ الرفض":"Notify Denial"}
                              </button>
                            )}
                            <button onClick={()=>deleteOrder(order.id)} style={{background:dark?"#2A0000":"#FEF2F2",border:"1px solid #EF4444",color:"#EF4444",padding:"9px 18px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>
                              {lang==="ar"?"حذف":"Delete"}
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
              {!showForm&&<button onClick={()=>{resetForm();setShowForm(true);}} style={{background:"#1C1510",color:"#E8DFD0",border:"none",padding:"12px 28px",fontSize:12,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="ar"?"+ إضافة منتج":"+ Add Product"}</button>}
            </div>
            {showForm&&(
              <form onSubmit={handleSaveProduct} style={{background:cardBg,border:`2px solid ${accent}`,padding:"32px 36px",marginBottom:24}}>
                <h3 style={{fontFamily:"Cormorant Garamond,serif",fontSize:24,fontWeight:300,color:text,marginBottom:24,marginTop:0}}>
                  {editingProduct?(lang==="ar"?"تعديل المنتج":"Edit Product"):(lang==="ar"?"إضافة منتج جديد":"Add New Product")}
                </h3>
                {/* Fix #1: image upload with key reset */}
                <div style={{marginBottom:18}}>
                  <label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:7,display:"block"}}>{lang==="ar"?"صورة المنتج":"Product Image"}</label>
                  <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                    {pImagePreview
                      ?<div style={{position:"relative",width:90,height:90,flexShrink:0}}><img src={pImagePreview} alt="preview" style={{width:90,height:90,objectFit:"cover",border:`1px solid ${border}`}} /><button type="button" onClick={()=>{setPImagePreview("");setPImageFile(null);setPImageKey(k=>k+1);}} style={{position:"absolute",top:-8,right:-8,background:"#EF4444",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button></div>
                      :<div onClick={()=>fileInputRef.current?.click()} style={{width:90,height:90,border:`2px dashed ${border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:textSub,fontSize:11,gap:4,flexShrink:0}}><span style={{fontSize:22}}>📷</span><span>{lang==="ar"?"رفع":"Upload"}</span></div>
                    }
                    <div style={{flex:1}}>
                      <input key={pImageKey} ref={fileInputRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;setPImageFile(f);const r=new FileReader();r.onload=ev=>setPImagePreview(ev.target?.result as string);r.readAsDataURL(f);}} style={{display:"none"}} />
                      <button type="button" onClick={()=>fileInputRef.current?.click()} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"7px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",letterSpacing:1}}>{lang==="ar"?"اختر صورة":"Choose Image"}</button>
                      <p style={{fontSize:11,color:textSub,marginTop:6}}>PNG/JPG · 800×800px</p>
                      {!pImagePreview&&<div style={{display:"flex",alignItems:"center",gap:7,marginTop:5}}><span style={{fontSize:11,color:textSub}}>{lang==="ar"?"إيموجي:":"or emoji:"}</span><input value={pEmoji} onChange={e=>setPEmoji(e.target.value)} style={{...inp,width:54,textAlign:"center",fontSize:20,padding:"3px 6px"}} /></div>}
                    </div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>
                  {[{l:lang==="ar"?"الاسم (إنجليزي)":"Name (EN)",v:pName,s:setPName,ph:"Oud Al Layl"},{l:lang==="ar"?"الاسم (عربي)":"Name (AR)",v:pNameAr,s:setPNameAr,ph:"عود الليل"}].map(f=>(
                    <div key={f.l}><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{f.l}</label><input value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.ph} style={inp} /></div>
                  ))}
                  <div><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"الفئة":"Category"}</label><select value={pCategory} onChange={e=>setPCategory(e.target.value)} style={{...inp}}>{adminCategories.map(c=><option key={c.slug} value={c.slug}>{lang==="ar"?c.name_ar:c.name}</option>)}</select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>
                  <div><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"السعر الأصلي (JOD)":"Original Price"}</label><input value={pPrice} onChange={e=>setPPrice(e.target.value)} placeholder="28" type="number" step="0.001" style={inp} /></div>
                  <div><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"الخصم %":"Discount %"}</label><input value={pDiscount} onChange={e=>setPDiscount(e.target.value)} placeholder="0" type="number" min="0" max="100" style={inp} /></div>
                  <div><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"السعر النهائي":"Final Price"}</label>
                    <div style={{...inp,background:dark?"#111":"#F0EBE3",display:"flex",alignItems:"center",gap:7}}>
                      {discountPct>0&&<span style={{textDecoration:"line-through",color:textSub,fontSize:12}}>{origPrice.toFixed(3)}</span>}
                      <span style={{color:"#22C55E",fontWeight:700}}>{finalPrice.toFixed(3)} JOD</span>
                      {discountPct>0&&<span style={{background:"#22C55E",color:"#fff",padding:"2px 6px",fontSize:10,fontWeight:700,marginLeft:"auto"}}>-{discountPct}%</span>}
                    </div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
                  {[{l:lang==="ar"?"الوصف (إنجليزي)":"Description (EN)",v:pDesc,s:setPDesc,ph:"Product description...",dir:"ltr"},{l:lang==="ar"?"الوصف (عربي)":"Description (AR)",v:pDescAr,s:setPDescAr,ph:"وصف المنتج...",dir:"rtl"}].map(f=>(
                    <div key={f.l}><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{f.l}</label><textarea value={f.v} onChange={e=>f.s(e.target.value)} rows={3} placeholder={f.ph} dir={f.dir} style={{...inp,resize:"vertical" as const}} /></div>
                  ))}
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button type="submit" disabled={pImageUploading} style={{background:pImageUploading?"#555":"#1C1510",color:"#E8DFD0",border:"none",padding:"12px 32px",fontSize:12,letterSpacing:2,textTransform:"uppercase",cursor:pImageUploading?"not-allowed":"pointer",fontFamily:"Jost,sans-serif"}}>{pImageUploading?(lang==="ar"?"جاري الرفع...":"Uploading..."):editingProduct?(lang==="ar"?"حفظ":"Save"):(lang==="ar"?"إضافة":"Add")}</button>
                  <button type="button" onClick={resetForm} style={{background:"transparent",color:textSub,border:`1px solid ${border}`,padding:"12px 22px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="ar"?"إلغاء":"Cancel"}</button>
                </div>
              </form>
            )}
            <div style={{background:cardBg,border:`1px solid ${border}`,overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{borderBottom:`2px solid ${border}`}}>
                  {(lang==="ar"?["","الاسم","العربي","الفئة","السعر","الخصم","الإجراءات"]:["","Name","Arabic","Category","Price","Discount","Actions"]).map(h=>(
                    <th key={h} style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,padding:"14px 16px",textAlign:lang==="ar"?"right":"left",fontWeight:500,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {products.map(p=>{
                    const hasDiscount=p.discount>0;
                    const orig=p.original_price||p.price;
                    return(
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

        {/* ── REVIEWS ── */}
        {activeTab==="reviews"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:28}}>
              {[
                {label:lang==="ar"?"إجمالي التقييمات":"Total Reviews",value:adminReviews.length,color:text},
                {label:lang==="ar"?"قيد المراجعة":"Pending",value:adminReviews.filter(r=>r.status==="pending").length,color:"#F59E0B"},
                {label:lang==="ar"?"منشور":"Approved",value:adminReviews.filter(r=>r.status==="approved").length,color:"#22C55E"},
              ].map(s=>(
                <div key={s.label} style={{background:cardBg,border:`1px solid ${border}`,padding:"18px 22px"}}>
                  <p style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 8px"}}>{s.label}</p>
                  <p style={{fontFamily:"Cormorant Garamond,serif",fontSize:28,color:s.color,margin:0}}>{s.value}</p>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gap:12}}>
              {adminReviews.map(r=>{
                const isPending=r.status==="pending";
                const isApproved=r.status==="approved";
                return (
                  <div key={r.id} style={{background:cardBg,borderTop:`1px solid ${border}`,borderBottom:`1px solid ${border}`,borderRight:`1px solid ${border}`,borderLeft:`4px solid ${isPending?"#F59E0B":isApproved?"#22C55E":"#EF4444"}`,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:14,fontWeight:600,color:text}}>{r.customer_name}</span>
                        <span style={{letterSpacing:2}}>{[1,2,3,4,5].map(i=><span key={i} style={{color:i<=r.rating?"#D4A84B":"#3A3020",fontSize:18,textShadow:i<=r.rating?"0 1px 4px rgba(212,168,75,0.4)":"none"}}>★</span>)}</span>
                        <span style={{background:isPending?(dark?"#2A1800":"#FEF3C7"):isApproved?(dark?"#002010":"#D1FAE5"):(dark?"#2A0000":"#FEF2F2"),color:isPending?"#F59E0B":isApproved?"#22C55E":"#EF4444",padding:"2px 10px",fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:600}}>{isPending?(lang==="ar"?"قيد المراجعة":"Pending"):isApproved?(lang==="ar"?"منشور":"Approved"):(lang==="ar"?"مرفوض":"Denied")}</span>
                      </div>
                      <p style={{fontSize:13,color:textSub,margin:"0 0 6px",lineHeight:1.6}}>"{r.comment}"</p>
                      <p style={{fontSize:11,color:textSub,margin:0,opacity:0.7}}>{new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</p>
                    </div>
                    <div style={{display:"flex",gap:8,flexShrink:0}}>
                      {isPending&&<>
                        <button onClick={async()=>{await supabase.from("reviews").update({status:"approved"}).eq("id",r.id);fetchReviews();showMsg("Approved");}} style={{background:"#22C55E",color:"#fff",border:"none",padding:"8px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>✓</button>
                        <button onClick={async()=>{await supabase.from("reviews").update({status:"denied"}).eq("id",r.id);fetchReviews();showMsg("Denied");}} style={{background:dark?"#2A0000":"#FEF2F2",border:"1px solid #EF4444",color:"#EF4444",padding:"8px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>✕</button>
                      </>}
                      <button onClick={async()=>{await supabase.from("reviews").delete().eq("id",r.id);fetchReviews();showMsg("Deleted");}} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"8px 12px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>🗑</button>
                    </div>
                  </div>
                );
              })}
              {adminReviews.length===0&&(
                <div style={{background:cardBg,border:`1px solid ${border}`,padding:60,textAlign:"center",color:textSub,fontSize:14}}>{lang==="ar"?"لا توجد تقييمات":"No reviews yet"}</div>
              )}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeTab==="settings"&&(
          <div>
            <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:26,fontWeight:300,color:text,marginBottom:28,marginTop:0}}>{lang==="ar"?"الإعدادات":"Settings"}</h2>

            {/* Transaction History Summary */}
            <div style={{background:cardBg,border:`1px solid ${border}`,padding:"22px 28px",marginBottom:24}}>
              <h3 style={{fontSize:13,letterSpacing:2,textTransform:"uppercase",color:accent,margin:"0 0 16px"}}>{lang==="ar"?"سجل المعاملات":"Transaction History"}</h3>
              <div style={{maxHeight:240,overflowY:"auto"}}>
                {orders.filter(o=>o.status==="delivered"||o.status==="confirmed"||o.status==="shipped").map((o,i)=>(
                  <div key={o.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:11,color:textSub,width:24,textAlign:"center",fontWeight:600}}>{i+1}</span>
                      <span style={{fontSize:13,color:text}}>{o.customer_name}</span>
                      <span style={{fontSize:10,color:textSub,background:dark?"#1E1E1E":"#F7F2EA",padding:"2px 8px"}}>{o.payment_method}</span>
                    </div>
                    <span style={{fontSize:14,color:"#22C55E",fontWeight:600}}>{typeof o.total_price==="number"?o.total_price.toFixed(3):o.total_price} JOD</span>
                  </div>
                ))}
                {orders.filter(o=>o.status==="delivered"||o.status==="confirmed"||o.status==="shipped").length===0&&(
                  <p style={{color:textSub,fontSize:12,textAlign:"center",padding:20}}>{lang==="ar"?"لا توجد معاملات":"No transactions yet"}</p>
                )}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:`2px solid ${accent}`}}>
                <span style={{fontSize:12,letterSpacing:2,textTransform:"uppercase",color:accent,fontWeight:600}}>{lang==="ar"?"الإجمالي":"Total Revenue"}</span>
                <span style={{fontFamily:"Jost,sans-serif",fontSize:22,fontWeight:700,color:"#22C55E"}}>{revenue.toFixed(3)} JOD</span>
              </div>
            </div>

            {/* Two-column settings */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>

              {/* Delivery Fees */}
              <SettingsCard title={lang==="ar"?"رسوم التوصيل":"Delivery Fees"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <div style={{display:"grid",gap:12,marginBottom:14}}>
                  <div>
                    <label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"عمان (JOD)":"Amman (JOD)"}</label>
                    <input type="number" step="0.001" min="0" value={shippingFees.amman} onChange={e=>setShippingFees(f=>({...f,amman:parseFloat(e.target.value)||0}))} style={inp} />
                  </div>
                  <div>
                    <label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"خارج عمان (JOD)":"Outside (JOD)"}</label>
                    <input type="number" step="0.001" min="0" value={shippingFees.outside} onChange={e=>setShippingFees(f=>({...f,outside:parseFloat(e.target.value)||0}))} style={inp} />
                  </div>
                </div>
                <button onClick={saveSettings} disabled={savingSettings} style={{background:savingSettings?"#555":"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:savingSettings?"not-allowed":"pointer",fontFamily:"Jost,sans-serif"}}>
                  {savingSettings?(lang==="ar"?"حفظ...":"Saving..."):(lang==="ar"?"حفظ":"Save")}
                </button>
              </SettingsCard>

              {/* Categories */}
              <SettingsCard title={lang==="ar"?"الفئات":"Categories"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <div style={{marginBottom:12}}>
                  {adminCategories.map(c=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${border}`}}>
                      <div><span style={{fontSize:13,color:text,fontWeight:600}}>{c.name}</span> <span style={{fontSize:11,color:textSub,direction:"rtl"}}>{c.name_ar}</span></div>
                      <button onClick={async()=>{await supabase.from("categories").delete().eq("id",c.id);fetchCategories();}} style={{background:"transparent",border:"none",color:"#EF4444",padding:"2px 8px",fontSize:12,cursor:"pointer"}}>x</button>
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} placeholder="Name" style={{...inp,fontSize:12,padding:"8px 10px"}} />
                  <input value={newCatAr} onChange={e=>setNewCatAr(e.target.value)} placeholder="عربي" dir="rtl" style={{...inp,fontSize:12,padding:"8px 10px"}} />
                </div>
                <input value={newCatSlug} onChange={e=>setNewCatSlug(e.target.value.toLowerCase().replace(/\s+/g,"-"))} placeholder="slug (e.g. bakhoor)" style={{...inp,fontSize:12,padding:"8px 10px",marginBottom:10}} />
                <button onClick={async()=>{if(!newCatName||!newCatSlug)return;await supabase.from("categories").insert([{name:newCatName,name_ar:newCatAr,slug:newCatSlug}]);setNewCatName("");setNewCatAr("");setNewCatSlug("");fetchCategories();showMsg("Added");}} style={{background:"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 20px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                  + {lang==="ar"?"إضافة":"Add"}
                </button>
              </SettingsCard>

              {/* WhatsApp Approve Message */}
              <SettingsCard title={lang==="ar"?"رسالة القبول":"Approve Message"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <p style={{fontSize:10,color:textSub,marginBottom:8}}>{"{name}"} = customer, {"{total}"} = total</p>
                <textarea value={waApproveMsg} onChange={e=>setWaApproveMsg(e.target.value)} rows={4} style={{...inp,resize:"vertical" as const,fontSize:12,marginBottom:10}} />
                <button onClick={async()=>{const{data}=await supabase.from("settings").select("*").eq("key","wa_messages").single();if(data){await supabase.from("settings").update({value:{approve:waApproveMsg,deny:waDenyMsg}}).eq("key","wa_messages");}else{await supabase.from("settings").insert([{key:"wa_messages",value:{approve:waApproveMsg,deny:waDenyMsg}}]);}showMsg("Saved!");}} style={{background:"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                  {lang==="ar"?"حفظ":"Save"}
                </button>
              </SettingsCard>

              {/* WhatsApp Deny Message */}
              <SettingsCard title={lang==="ar"?"رسالة الرفض":"Deny Message"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <p style={{fontSize:10,color:textSub,marginBottom:8}}>{"{name}"} = customer, {"{reason}"} = reason</p>
                <textarea value={waDenyMsg} onChange={e=>setWaDenyMsg(e.target.value)} rows={4} style={{...inp,resize:"vertical" as const,fontSize:12,marginBottom:10}} />
                <button onClick={async()=>{const{data}=await supabase.from("settings").select("*").eq("key","wa_messages").single();if(data){await supabase.from("settings").update({value:{approve:waApproveMsg,deny:waDenyMsg}}).eq("key","wa_messages");}else{await supabase.from("settings").insert([{key:"wa_messages",value:{approve:waApproveMsg,deny:waDenyMsg}}]);}showMsg("Saved!");}} style={{background:"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                  {lang==="ar"?"حفظ":"Save"}
                </button>
              </SettingsCard>
            </div>
          </div>
        )}
      </div>

      {/* DENY MODAL — Fix #8: WA deny button */}
      {denyModal&&(
        <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(0,0,0,0.6)"}}>
          <div style={{background:cardBg,border:`1px solid ${border}`,padding:"32px 36px",width:"100%",maxWidth:420}}>
            <h3 style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:300,color:text,marginBottom:6,marginTop:0}}>{lang==="ar"?"رفض الطلب":"Deny Order"}</h3>
            <p style={{fontSize:12,color:textSub,marginBottom:16}}>{lang==="ar"?"رقم العميل:":"Customer phone:"} <strong style={{color:text}}>{denyModal.phone}</strong></p>
            <label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:6,display:"block"}}>{lang==="ar"?"سبب الرفض *":"Reason *"}</label>
            <select value={denyReason} onChange={e=>setDenyReason(e.target.value)} style={{...inp,marginBottom:16}}>
              <option value="">{lang==="ar"?"-- اختر سببًا --":"-- Select reason --"}</option>
              <option value={lang==="ar"?"المنتج غير متوفر حاليًا":"Product currently out of stock"}>{lang==="ar"?"المنتج غير متوفر":"Out of stock"}</option>
              <option value={lang==="ar"?"العنوان خارج منطقة التوصيل":"Outside delivery area"}>{lang==="ar"?"خارج منطقة التوصيل":"Outside delivery area"}</option>
              <option value={lang==="ar"?"التحويل غير مكتمل أو غير صحيح":"Transfer incomplete or incorrect"}>{lang==="ar"?"مشكلة في التحويل":"Transfer issue"}</option>
              <option value={lang==="ar"?"سبب آخر":"Other"}>{lang==="ar"?"سبب آخر":"Other"}</option>
            </select>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button onClick={denyOrder} disabled={!denyReason} style={{background:!denyReason?"#555":"#EF4444",color:"#fff",border:"none",padding:"11px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:!denyReason?"not-allowed":"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>
                {lang==="ar"?"تأكيد الرفض":"Confirm Deny"}
              </button>
              <button onClick={()=>{setDenyModal(null);setDenyReason("");}} style={{background:"transparent",color:textSub,border:`1px solid ${border}`,padding:"11px 18px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="ar"?"إلغاء":"Cancel"}</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModal&&(
        <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(0,0,0,0.6)"}}>
          <div style={{background:cardBg,border:`1px solid ${border}`,padding:"36px 40px",width:"100%",maxWidth:380,textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:"50%",background:dark?"#2A0000":"#FEF2F2",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:24}}>🗑️</div>
            <h3 style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:300,color:text,marginBottom:8,marginTop:0}}>
              {lang==="ar"?"تأكيد الحذف":"Confirm Delete"}
            </h3>
            <p style={{fontSize:13,color:textSub,marginBottom:24,lineHeight:1.6}}>
              {deleteModal.type==="single"
                ?(lang==="ar"?"هل أنت متأكد من حذف هذا الطلب نهائياً؟ لا يمكن التراجع عن هذا الإجراء.":"Are you sure you want to permanently delete this order? This action cannot be undone.")
                :(lang==="ar"?`هل أنت متأكد من حذف ${deleteModal.count} طلب نهائياً؟ لا يمكن التراجع.`:`Are you sure you want to permanently delete ${deleteModal.count} orders? This cannot be undone.`)
              }
            </p>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={confirmDelete} style={{background:"#EF4444",color:"#fff",border:"none",padding:"12px 28px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>
                {lang==="ar"?"نعم، احذف":"Yes, Delete"}
              </button>
              <button onClick={()=>setDeleteModal(null)} style={{background:"transparent",color:textSub,border:`1px solid ${border}`,padding:"12px 24px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                {lang==="ar"?"إلغاء":"Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"#1C1510",color:"#E8DFD0",padding:"13px 28px",fontSize:12,letterSpacing:1,zIndex:999,border:`1px solid ${accent}`,whiteSpace:"nowrap"}}>{toast}</div>}
    </div>
  );
}
