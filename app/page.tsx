"use client";
import { supabase } from "../supabase";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { saveProduct, deleteProduct, toggleProductStock, reorderProducts, uploadProductImage, setOrderStatus, setOrdersStatusBulk, deleteOrders, saveSetting, addCategory, deleteCategory, setReviewStatus, deleteReview, addPromoCode, togglePromoCode, deletePromoCode } from "./actions";

type Order = {
  id: number; created_at: string; customer_name: string; phone: string;
  address: string; notes?: string; total_price: number; items: any[];
  status: string; payment_method: string; transfer_image_url?: string;
  denial_reason?: string; country_code?: string; shipping_zone?: string; shipping_cost?: number;
};
type Product = {
  id: number; name: string; nameAr: string; emoji: string; image_url?: string; images?: string[];
  price: number; original_price?: number; discount: number; desc: string; descAr: string; category: string;
  out_of_stock?: boolean; sold_out?: boolean; sort_order?: number|null;
};
type PromoCode = { id: number; code: string; discount_percent: number; active: boolean; created_at: string };

const STATUS_LABELS: Record<string,{en:string;ar:string}> = {
  pending:   {en:"Pending",   ar:"قيد الانتظار"},
  confirmed: {en:"Confirmed", ar:"مؤكد"},
  shipped:   {en:"Shipped",   ar:"تم الشحن"},
  delivered: {en:"Delivered", ar:"تم التسليم"},
  denied:    {en:"Denied",    ar:"مرفوض"},
};
const STATUS_FLOW: Record<string,string> = {pending:"confirmed", confirmed:"shipped", shipped:"delivered"};

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

function TransferImage({url,border}:{url:string;border:string}) {
  const [signedUrl, setSignedUrl] = useState<string|null>(null);
  useEffect(()=>{
    let cancelled=false;
    const path=url.split("/transfer-screenshots/")[1];
    if(!path){setSignedUrl(url);return;}
    supabase.storage.from("transfer-screenshots").createSignedUrl(path,3600).then(({data,error})=>{
      if(error)console.error("Signed URL error:",error.message,"path:",path);
      if(!cancelled&&data?.signedUrl)setSignedUrl(data.signedUrl);
    });
    return()=>{cancelled=true;};
  },[url]);
  if(!signedUrl)return null;
  return (
    <a href={signedUrl} target="_blank" rel="noopener noreferrer">
      <img src={signedUrl} alt="transfer" style={{maxWidth:260,maxHeight:160,objectFit:"contain",border:`1px solid ${border}`,cursor:"pointer"}} />
    </a>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState<"orders"|"products"|"reviews"|"settings">("orders");
  const [adminPin, setAdminPin] = useState("1111");
  const [revenueUnlocked, setRevenueUnlocked] = useState(false);
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [pinModal, setPinModal] = useState<null|"revenue"|"settings">(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [curPin, setCurPin] = useState(""); const [newPin, setNewPin] = useState(""); const [confirmPin, setConfirmPin] = useState(""); const [savingPin, setSavingPin] = useState(false);
  const [newEmail, setNewEmail] = useState(""); const [savingEmail, setSavingEmail] = useState(false);
  const [curPassword, setCurPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [savingPassword, setSavingPassword] = useState(false);
  const changePin=async()=>{
    if(curPin!==adminPin){showMsg(lang==="ar"?"الرمز الحالي غير صحيح":"Current PIN is incorrect");return;}
    if(newPin.length<4){showMsg(lang==="ar"?"الرمز الجديد يجب أن يكون 4 أرقام على الأقل":"New PIN must be at least 4 digits");return;}
    if(newPin!==confirmPin){showMsg(lang==="ar"?"الرمزان غير متطابقين":"PINs don't match");return;}
    setSavingPin(true);
    const ok=await runAction(()=>saveSetting("admin_pin",{pin:newPin}));
    setSavingPin(false);
    if(ok){setAdminPin(newPin);setCurPin("");setNewPin("");setConfirmPin("");showMsg(lang==="ar"?"تم تغيير الرمز":"PIN changed");}
  };
  const resetPin=async()=>{
    setSavingPin(true);
    const ok=await runAction(()=>saveSetting("admin_pin",{pin:"1111"}));
    setSavingPin(false);
    if(ok){setAdminPin("1111");setCurPin("");setNewPin("");setConfirmPin("");showMsg(lang==="ar"?"تمت إعادة الرمز إلى 1111":"PIN reset to 1111");}
  };
  const changeEmail=async()=>{
    if(!newEmail.trim()||!newEmail.includes("@")){showMsg(lang==="ar"?"بريد إلكتروني غير صالح":"Invalid email");return;}
    setSavingEmail(true);
    const{error}=await supabase.auth.updateUser({email:newEmail.trim()});
    setSavingEmail(false);
    if(error){showMsg(error.message);return;}
    setNewEmail("");
    showMsg(lang==="ar"?"تحقق من بريدك الإلكتروني الجديد لتأكيد التغيير":"Check your new email to confirm the change");
  };
  const changePassword=async()=>{
    if(newPassword.length<6){showMsg(lang==="ar"?"كلمة المرور يجب أن تكون 6 أحرف على الأقل":"Password must be at least 6 characters");return;}
    if(newPassword!==confirmPassword){showMsg(lang==="ar"?"كلمتا المرور غير متطابقتين":"Passwords don't match");return;}
    setSavingPassword(true);
    const{error:verifyErr}=await supabase.auth.signInWithPassword({email:userEmail,password:curPassword});
    if(verifyErr){setSavingPassword(false);showMsg(lang==="ar"?"كلمة المرور الحالية غير صحيحة":"Current password is incorrect");return;}
    const{error}=await supabase.auth.updateUser({password:newPassword});
    setSavingPassword(false);
    if(error){showMsg(error.message);return;}
    setCurPassword("");setNewPassword("");setConfirmPassword("");
    showMsg(lang==="ar"?"تم تغيير كلمة المرور":"Password changed");
  };
  const submitPin=()=>{
    if(pinInput===adminPin){
      if(pinModal==="revenue")setRevenueUnlocked(true);
      if(pinModal==="settings"){setSettingsUnlocked(true);setActiveTab("settings");}
      setPinModal(null);setPinInput("");setPinError(false);
    } else {setPinError(true);}
  };
  const openTab=(t:"orders"|"products"|"reviews"|"settings")=>{
    if(t==="settings"){
      if(!settingsUnlocked){setPinModal("settings");setPinInput("");setPinError(false);}
      else setActiveTab(t);
      return;
    }
    if(activeTab==="settings")setSettingsUnlocked(false);
    setActiveTab(t);
  };
  const [dark, setDark] = useState(false); const [lang, setLang] = useState<"en"|"ar">("en");
  const [adminMenu, setAdminMenu] = useState(false);
  const [toast, setToast] = useState("");

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [dragIndex, setDragIndex] = useState<number|null>(null);
  const [showForm, setShowForm] = useState(false); const [editingProduct, setEditingProduct] = useState<Product|null>(null);
  const [pName, setPName] = useState(""); const [pNameAr, setPNameAr] = useState(""); const [pEmoji, setPEmoji] = useState("🪔");
  const [pImageFile, setPImageFile] = useState<File|null>(null); const [pImagePreview, setPImagePreview] = useState(""); const [pImageUploading, setPImageUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string|null>(null);
  const [pImageKey, setPImageKey] = useState(0); // Fix #1: reset input key
  // Multiple images (up to 5): each slot is either an existing URL or a pending File
  const [pImages, setPImages] = useState<{url:string;file?:File}[]>([]);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const [pPrice, setPPrice] = useState(""); const [pDiscount, setPDiscount] = useState("0");
  const [pDesc, setPDesc] = useState(""); const [pDescAr, setPDescAr] = useState(""); const [pCategory, setPCategory] = useState("perfume");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState("all");
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set()); // Fix #5
  const [denyModal, setDenyModal] = useState<{id:number,phone:string}|null>(null);
  const [deleteModal, setDeleteModal] = useState<{type:"single"|"bulk",id?:number,count?:number}|null>(null);
  const [confirmModal, setConfirmModal] = useState<Order[]|null>(null);
  const [confirmSent, setConfirmSent] = useState<Set<number>>(new Set());
  const [denyReason, setDenyReason] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<number|null>(null);

  // Settings — Fix #12: shipping fees editable
  const [shippingFees, setShippingFees] = useState({amman:0,outside:2});
  const [cliqInfo, setCliqInfo] = useState({alias:"",bank:"",retrievedName:""});
  const [savingCliq, setSavingCliq] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [adminCategories, setAdminCategories] = useState<{id:number;name:string;name_ar:string;slug:string}[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatAr, setNewCatAr] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [adminReviews, setAdminReviews] = useState<{id:number;customer_name:string;rating:number;comment:string;status:string;created_at:string}[]>([]);
  const [waApproveMsg, setWaApproveMsg] = useState("Hello {name}!\nYour Joud Aloud order has been confirmed.\nTotal: {total} JOD\nOur team will contact you soon. Thank you!");
  const [waDenyMsg, setWaDenyMsg] = useState("Hello {name},\nUnfortunately, your Joud Aloud order has been denied.\nReason: {reason}.\nPlease contact us if a refund is applicable. Thank you.");

  // Promo codes
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [newPromoCode, setNewPromoCode] = useState("");
  const [newPromoDiscount, setNewPromoDiscount] = useState("");
  const [savingPromo, setSavingPromo] = useState(false);

  // Maintenance mode
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const bg=dark?"#0D0D0D":"#F7F4EF"; const cardBg=dark?"#161616":"#FFFFFF";
  const border=dark?"#252525":"#E5DDD0"; const text=dark?"#EDE8E0":"#1C1510";
  const textSub="#7A6A58"; const accent="#8B6F47"; const navBg=dark?"#080808":"#1C1510";
  const inp={width:"100%",padding:"11px 14px",background:dark?"#1E1E1E":"#FDFAF6",border:`1px solid ${border}`,color:text,fontFamily:"Jost,sans-serif",fontSize:14,outline:"none",boxSizing:"border-box" as const};

  useEffect(()=>{
    supabase.auth.getUser().then(({data:{user}})=>{
      setIsAuthenticated(!!user);
      setCheckingSession(false);
      if(user?.email)setUserEmail(user.email);
      if(!user)router.replace("/login");
    });
    const{data:sub}=supabase.auth.onAuthStateChange((_event,session)=>{
      setIsAuthenticated(!!session?.user);
      if(!session?.user)router.replace("/login");
    });
    return()=>sub.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    const onScroll=()=>setAdminMenu(false);
    window.addEventListener("scroll",onScroll,{passive:true});
    return()=>window.removeEventListener("scroll",onScroll);
  },[]);
  const handleLogout=async()=>{await supabase.auth.signOut();router.replace("/login");};
  const [actionLoading,setActionLoading]=useState(false);
  // Wraps server-action calls: shows a loading overlay, redirects to /login if the session expired server-side, otherwise surfaces the error
  const runAction=async(fn:()=>Promise<any>):Promise<boolean>=>{
    setActionLoading(true);
    try{await fn();return true;}
    catch(e:any){
      if(e?.message==="Not authenticated"){router.replace("/login");return false;}
      showMsg(e?.message||"Error");return false;
    }finally{setActionLoading(false);}
  };
  useEffect(()=>{if(isAuthenticated){fetchProducts();fetchOrders();fetchSettings();fetchAdminPin();fetchCliqInfo();fetchCategories();fetchWAMessages();fetchReviews();fetchPromoCodes();fetchMaintenanceMode();}},[isAuthenticated]);

  // Notification sound for new orders — polls every 15 seconds
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const [bellRing, setBellRing] = useState(false);
  const [notifHistory, setNotifHistory] = useState<{msg:string;time:number}[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const pushNotif=(msg:string)=>{showMsg(msg);setNotifHistory(h=>[{msg,time:Date.now()},...h].slice(0,30));};

  useEffect(()=>{
    // Create audio element with a base64 beep sound
    const audio = new Audio("data:audio/wav;base64,UklGRoQJAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YWAJAAAAAEI2q0wrNgAA7cmXswTKAADlNShMzjUAAEnKGrRgygAAiDWlS3E1AACmyp20vcoAACw1IksVNQAAA8sgtRrLAADPNJ9KuDQAAF/Lo7V2ywAAcjQcSls0AAC8yya208sAABY0mUn/MwAAGcyptjDMAAC5MxVJojMAAHXMLLeMzAAAXDOSSEUzAADSzK+36cwAAAAzD0joMgAAL80yuEbNAACjMoxHjDIAAIvNtbijzQAARjIJRy8yAADozTi5/80AAOoxhkbSMQAARc67uVzOAACNMQNGdjEAAKHOPrq5zgAAMDGARRkxAAD+zsK6Fc8AANQw/US8MAAAW89Fu3LPAAB3MHpEYDAAALfPyLvPzwAAGjD3QwMwAAAU0Eu8K9AAAL4vdEOmLwAAcdDOvIjQAABhL/FCSi8AAM3QUb3l0AAABC9uQu0uAAAq0dS9QdEAAKgu60GQLgAAh9FXvp7RAABLLmdBNC4AAOTR2r770QAA7i3kQNctAABA0l2/V9IAAJEtYUB6LQAAndLgv7TSAAA1Ld4/Hi0AAPrSY8AR0wAA2CxbP8EsAABW0+bAbdMAAHss2D5kLAAAs9NpwcrTAAAfLFU+CCwAABDU7cEn1AAAwivSPasrAABs1HDCg9QAAGUrTz1OKwAAydTzwuDUAAAJK8w88ioAACbVdsM91QAArCpJPJUqAACC1fnDmdUAAE8qxjs4KgAA39V8xPbVAADzKUM73CkAADzW/8RT1gAAlinAOn8pAACY1oLFsNYAADkpPDoiKQAA9dYFxgzXAADdKLk5xSgAAFLXiMZp1wAAgCg2OWkoAACu1wvHxtcAACMoszgMKAAAC9iOxyLYAADHJzA4rycAAGjYEch/2AAAaietN1MnAADE2JTI3NgAAA0nKjf2JgAAIdkXyTjZAACxJqc2mSYAAH7Zm8mV2QAAVCYkNj0mAADa2R7K8tkAAPcloTXgJQAAN9qhyk7aAACbJR41gyUAAJTaJMur2gAAPiWbNCclAADw2qfLCNsAAOEkGDTKJAAATdsqzGTbAACFJJUzbSQAAKrbrczB2wAAKCQSMxEkAAAH3DDNHtwAAMsjjjK0IwAAY9yzzXrcAABuIwsyVyMAAMDcNs7X3AAAEiOIMfsiAAAd3bnONN0AALUiBTGeIgAAed08z5DdAABYIoIwQSIAANbdv8/t3QAA/CH/L+UhAAAz3kLQSt4AAJ8hfC+IIQAAj97F0KbeAABCIfkuKyEAAOzeSdED3wAA5iB2Ls8gAABJ38zRYN8AAIkg8y1yIAAApd9P0rzfAAAsIHAtFSAAAALg0tIZ4AAA0B/tLLkfAABf4FXTduAAAHMfaixcHwAAu+DY09PgAAAWH+cr/x4AABjhW9Qv4QAAuh5kK6IeAAB14d7UjOEAAF0e4CpGHgAA0eFh1enhAAAAHl0q6R0AAC7i5NVF4gAApB3aKYwdAACL4mfWouIAAEcdVykwHQAA5+Lq1v/iAADqHNQo0xwAAETjbddb4wAAjhxRKHYcAACh4/DXuOMAADEczicaHAAA/eNz2BXkAADUG0snvRsAAFrk99hx5AAAeBvIJmAbAAC35HrZzuQAABsbRSYEGwAAE+X92SvlAAC+GsIlpxoAAHDlgNqH5QAAYRo/JUoaAADN5QPb5OUAAAUavCTuGQAAKuaG20HmAACoGTkkkRkAAIbmCdyd5gAASxm1IzQZAADj5ozc+uYAAO8YMiPYGAAAQOcP3VfnAACSGK8iexgAAJznkt2z5wAANRgsIh4YAAD55xXeEOgAANkXqSHCFwAAVuiY3m3oAAB8FyYhZRcAALLoG9/J6AAAHxejIAgXAAAP6Z7fJukAAMMWICCsFgAAbOki4IPpAABmFp0fTxYAAMjppeDf6QAACRYaH/IVAAAl6ijhPOoAAK0Vlx6VFQAAguqr4ZnqAABQFRQeORUAAN7qLuL26gAA8xSRHdwUAAA767HiUusAAJcUDh1/FAAAmOs046/rAAA6FIscIxQAAPTrt+MM7AAA3RMHHMYTAABR7DrkaOwAAIEThBtpEwAAruy95MXsAAAkEwEbDRMAAArtQOUi7QAAxxJ+GrASAABn7cPlfu0AAGsS+xlTEgAAxO1G5tvtAAAOEngZ9xEAACDuyeY47gAAsRH1GJoRAAB97kznlO4AAFURchg9EQAA2u7Q5/HuAAD4EO8X4RAAADfvU+hO7wAAmxBsF4QQAACT79boqu8AAD4Q6RYnEAAA8O9Z6QfwAADiD2YWyw8AAE3w3Olk8AAAhQ/jFW4PAACp8F/qwPAAACgPYBURDwAABvHi6h3xAADMDt0UtQ4AAGPxZet68QAAbw5ZFFgOAAC/8ejr1vEAABIO1hP7DQAAHPJr7DPyAAC2DVMTnw0AAHny7uyQ8gAAWQ3QEkINAADV8nHt7PIAAPwMTRLlDAAAMvP07UnzAACgDMoRiQwAAI/zd+6m8wAAQwxHESwMAADr8/ruA/QAAOYLxBDPCwAASPR+71/0AACKC0EQcgsAAKX0AfC89AAALQu+DxYLAAAB9YTwGfUAANAKOw+5CgAAXvUH8XX1AAB0CrgOXAoAALv1ivHS9QAAFwo1DgAKAAAX9g3yL/YAALoJsg2jCQAAdPaQ8ov2AABeCS8NRgkAANH2E/Po9gAAAQmrDOoIAAAt95bzRfcAAKQIKAyNCAAAivcZ9KH3AABICKULMAgAAOf3nPT+9wAA6wciC9QHAABD+B/1W/gAAI4Hnwp3BwAAoPii9bf4AAAxBxwKGgcAAP34JfYU+QAA1QaZCb4GAABa+an2cfkAAHgGFglhBgAAtvks9835AAAbBpMIBAYAABP6r/cq+gAAvwUQCKgFAABw+jL4h/oAAGIFjQdLBQAAzPq1+OP6AAAFBQoH7gQAACn7OPlA+wAAqQSHBpIEAACG+7v5nfsAAEwEBAY1BAAA4vs++vn7AADvA4AF2AMAAD/8wfpW/AAAkwP9BHwDAACc/ET7s/wAADYDegQfAwAA+PzH+w/9AADZAvcDwgIAAFX9Svxs/QAAfQJ0A2UCAACy/c38yf0AACAC8QIJAgAADv5Q/Sb+AADDAW4CrAEAAGv+0/2C/gAAZwHrAU8BAADI/lf+3/4AAAoBaAHzAAAAJP/a/jz/AACtAOUAlgAAAIH/Xf+Y/wAAUQBiADkAAADe/+D/9f8=");
    audio.volume = 1;
    audioRef.current = audio;
  },[]);

  const playNotification = () => {
    try {
      audioRef.current?.play()?.catch(()=>{});
      setBellRing(true);
      setTimeout(()=>setBellRing(false), 2000);
    } catch(e) {}
  };

  // Browsers block audio playback until the user interacts with the page — unlock on first interaction
  useEffect(()=>{
    const unlock=()=>{
      const a=audioRef.current;
      if(a){a.muted=true;a.play().then(()=>{a.pause();a.currentTime=0;a.muted=false;}).catch(()=>{});}
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("keydown",unlock);
    };
    window.addEventListener("pointerdown",unlock);
    window.addEventListener("keydown",unlock);
    return()=>{window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);};
  },[]);
  const prevOrderStatusesRef = useRef<Map<number,string>|null>(null);
  const STATUS_LABEL:Record<string,{en:string;ar:string}> = {
    pending:{en:"received",ar:"مستلم"},
    confirmed:{en:"approved",ar:"مقبول"},
    denied:{en:"denied",ar:"مرفوض"},
    shipped:{en:"shipped",ar:"تم الشحن"},
    delivered:{en:"delivered",ar:"تم التوصيل"},
  };
  useEffect(()=>{
    if(!isAuthenticated) return;
    const interval = setInterval(async()=>{
      const{data}=await supabase.from("orders").select("id,status,customer_name").order("id",{ascending:false});
      if(!data)return;
      const prev=prevOrderStatusesRef.current;
      if(prev){
        for(const o of data){
          const before=prev.get(o.id);
          if(before===undefined&&o.status==="pending"){
            pushNotif(lang==="ar"?`🔔 طلب جديد من ${o.customer_name}`:`🔔 New order from ${o.customer_name}`);
          } else if(before!==undefined&&before!==o.status){
            const lbl=STATUS_LABEL[o.status];
            pushNotif(lang==="ar"?`📦 الطلب #${o.id} ${lbl?.ar||o.status}`:`📦 Order #${o.id} ${lbl?.en||o.status}`);
          }
        }
        fetchOrders();
      }
      prevOrderStatusesRef.current=new Map(data.map(o=>[o.id,o.status]));
      const pendingCount=data.filter(o=>o.status==="pending").length;
      if(pendingCount>0)playNotification();
    }, 5000);
    return ()=>clearInterval(interval);
  },[isAuthenticated]);
  const showMsg=(m:string)=>{setToast(m);setTimeout(()=>setToast(""),2500);};
  const fetchProducts=async()=>{const{data}=await supabase.from("products").select("*").order("sort_order",{ascending:true,nullsFirst:false}).order("id",{ascending:true});if(data)setProducts(data);};
  const fetchOrders=async()=>{const{data}=await supabase.from("orders").select("*").order("id",{ascending:false});if(data)setOrders(data);};
  const fetchCategories=async()=>{const{data}=await supabase.from("categories").select("*").order("id",{ascending:true});if(data)setAdminCategories(data);};
  const fetchReviews=async()=>{const{data}=await supabase.from("reviews").select("*").order("created_at",{ascending:false});if(data)setAdminReviews(data);};
  const fetchWAMessages=async()=>{const{data}=await supabase.from("settings").select("*").eq("key","wa_messages").single();if(data?.value){setWaApproveMsg(data.value.approve||waApproveMsg);setWaDenyMsg(data.value.deny||waDenyMsg);}};
  const fetchSettings=async()=>{const{data}=await supabase.from("settings").select("*").eq("key","shipping_fees").single();if(data?.value)setShippingFees(data.value);};
  const fetchAdminPin=async()=>{const{data}=await supabase.from("settings").select("*").eq("key","admin_pin").single();if(data?.value?.pin)setAdminPin(data.value.pin);};
  const fetchCliqInfo=async()=>{const{data}=await supabase.from("settings").select("*").eq("key","cliq").single();if(data?.value)setCliqInfo({alias:data.value.alias||"",bank:data.value.bank||"",retrievedName:data.value.retrievedName||""});};
  const fetchPromoCodes=async()=>{const{data}=await supabase.from("promo_codes").select("*").order("id",{ascending:false});if(data)setPromoCodes(data);};
  const fetchMaintenanceMode=async()=>{const{data}=await supabase.from("settings").select("*").eq("key","maintenance_mode").single();if(typeof data?.value==="boolean")setMaintenanceMode(data.value);};

  // Fix #7: different message on each wrong attempt
  const resetForm=()=>{setPName("");setPNameAr("");setPEmoji("🪔");setPPrice("");setPDiscount("");setPDesc("");setPDescAr("");setPCategory("perfume");setPImageFile(null);setPImagePreview("");setPImageKey(k=>k+1);setPImages([]);setEditingProduct(null);setShowForm(false);};
  const startEdit=(p:Product)=>{setEditingProduct(p);setPName(p.name);setPNameAr(p.nameAr);setPEmoji(p.emoji||"🪔");setPPrice(String(p.price));setPDiscount(String(p.discount));setPDesc(p.desc);setPDescAr(p.descAr);setPCategory(p.category);setPImagePreview(p.image_url||"");setPImageFile(null);setPImageKey(k=>k+1);setPImages((p.images||[]).map(url=>({url})));setShowForm(true);};

  const uploadImage=async(file:File):Promise<string|null>=>{
    try{
      const fd=new FormData();fd.append("file",file);
      return await uploadProductImage(fd);
    }catch(e:any){if(e?.message==="Not authenticated"){router.replace("/login");return null;}showMsg("Upload failed: "+e.message);return null;}
  };

  const origPrice=parseFloat(pPrice)||0;
  const discountPct=parseFloat(pDiscount)||0;
  const finalPrice=discountPct>0?+(origPrice*(1-discountPct/100)).toFixed(3):origPrice;

  const handleSaveProduct=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!pName||!pPrice){showMsg("Name and price required");return;}
    let image_url=pImagePreview&&!pImagePreview.startsWith("data:")?pImagePreview:(editingProduct?.image_url||"");
    if(pImageFile){setPImageUploading(true);const url=await uploadImage(pImageFile);setPImageUploading(false);if(!url)return;image_url=url;}
    // Upload any pending extra images (max 5)
    setPImageUploading(true);
    const images:string[]=[];
    for(const img of pImages.slice(0,5)){
      if(img.file){const url=await uploadImage(img.file);if(!url){setPImageUploading(false);return;}images.push(url);}
      else images.push(img.url);
    }
    setPImageUploading(false);
    const payload={name:pName,nameAr:pNameAr,emoji:pEmoji,image_url,images,price:finalPrice,original_price:origPrice,discount:discountPct,desc:pDesc,descAr:pDescAr,category:pCategory};
    if(!await runAction(()=>saveProduct(payload,editingProduct?.id)))return;
    showMsg(editingProduct?"Updated!":"Added!");fetchProducts();resetForm();
  };
  const handleProductDrop=async(dropIndex:number)=>{
    if(dragIndex===null||dragIndex===dropIndex){setDragIndex(null);return;}
    const reordered=[...products];
    const [moved]=reordered.splice(dragIndex,1);
    reordered.splice(dropIndex,0,moved);
    setProducts(reordered);
    setDragIndex(null);
    await runAction(()=>reorderProducts(reordered.map((p,i)=>({id:p.id,sort_order:i+1}))));
    fetchProducts();
  };
  const handleDeleteProduct=async(id:number)=>{
    if(!confirm(lang==="ar"?"حذف هذا المنتج؟":"Delete this product?"))return;
    if(!await runAction(()=>deleteProduct(id)))return;
    showMsg("Deleted");fetchProducts();
  };
  const toggleStock=async(id:number,field:"out_of_stock"|"sold_out",current:boolean)=>{
    if(!await runAction(()=>toggleProductStock(id,field,current)))return;
    showMsg(!current?(field==="out_of_stock"?(lang==="ar"?"غير متوفر":"Out of stock"):(lang==="ar"?"تم البيع":"Sold out")):(lang==="ar"?"متوفر":"Available"));
    fetchProducts();
  };

  const noteStatus=(id:number,status:string)=>{prevOrderStatusesRef.current?.set(id,status);};
  const approveOrder=async(id:number)=>{if(!await runAction(()=>setOrderStatus(id,"confirmed")))return;noteStatus(id,"confirmed");pushNotif(lang==="ar"?`✅ الطلب #${id} مقبول`:`✅ Order #${id} approved`);fetchOrders();};
  const advanceStatus=async(order:Order)=>{const next=STATUS_FLOW[order.status];if(!next)return;if(!await runAction(()=>setOrderStatus(order.id,next)))return;noteStatus(order.id,next);pushNotif(`→ Order #${order.id} ${next}`);fetchOrders();};
  const denyOrder=async()=>{if(!denyModal)return;if(!await runAction(()=>setOrderStatus(denyModal.id,"denied",denyReason)))return;noteStatus(denyModal.id,"denied");pushNotif(lang==="ar"?`❌ الطلب #${denyModal.id} مرفوض`:`❌ Order #${denyModal.id} denied`);setDenyModal(null);setDenyReason("");fetchOrders();};

  // WhatsApp: send confirm message to customer
  const waConfirm=(order:Order)=>{
    const msg=waApproveMsg.replace(/{name}/g,order.customer_name).replace(/{total}/g,String(typeof order.total_price==="number"?order.total_price.toFixed(2):order.total_price));
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
      if(!await runAction(()=>deleteOrders([deleteModal.id!])))return;
      showMsg(lang==="ar"?"تم الحذف":"Deleted");
    } else {
      if(!await runAction(()=>deleteOrders([...selectedOrders])))return;
      showMsg(`Deleted ${selectedOrders.size} orders`);clearSelection();
    }
    setDeleteModal(null);fetchOrders();
  };

  const toggleSelect=(id:number)=>{const s=new Set(selectedOrders);s.has(id)?s.delete(id):s.add(id);setSelectedOrders(s);};
  const selectAll=()=>{const ids=filteredOrders.map(o=>o.id);setSelectedOrders(new Set(ids));};
  const clearSelection=()=>setSelectedOrders(new Set());
  const bulkSendConfirmation=()=>{
    const selected=[...selectedOrders].map(id=>orders.find(o=>o.id===id)).filter(Boolean) as Order[];
    if(!selected.length)return;
    setConfirmSent(new Set());
    setConfirmModal(selected);
  };
  const bulkAdvance=async()=>{
    const byNext=new Map<string,number[]>();
    for(const id of selectedOrders){const o=orders.find(x=>x.id===id);const next=o&&STATUS_FLOW[o.status];if(next){if(!byNext.has(next))byNext.set(next,[]);byNext.get(next)!.push(id);}}
    const total=[...byNext.values()].reduce((s,ids)=>s+ids.length,0);
    if(!total){showMsg(lang==="ar"?"لا يمكن تقديم حالة الطلبات المحددة":"Selected orders can't be advanced further");return;}
    for(const[next,ids]of byNext){
      if(!await runAction(()=>setOrdersStatusBulk(ids,next)))return;
      ids.forEach(id=>noteStatus(id,next));
    }
    pushNotif(lang==="ar"?`→ تم تقديم ${total} طلب`:`→ Advanced ${total} orders`);fetchOrders();clearSelection();
  };

  // Fix #12: save shipping settings
  const saveSettings=async()=>{
    setSavingSettings(true);
    const ok=await runAction(()=>saveSetting("shipping_fees",shippingFees));
    setSavingSettings(false);
    if(!ok)return;
    showMsg(lang==="ar"?"تم الحفظ":"Settings saved!");
  };

  const saveCliqInfo=async()=>{
    if(!cliqInfo.alias.trim()||!cliqInfo.bank.trim()||!cliqInfo.retrievedName.trim()){showMsg(lang==="ar"?"جميع حقول CliQ مطلوبة":"All CliQ fields are required");return;}
    setSavingCliq(true);
    const ok=await runAction(()=>saveSetting("cliq",cliqInfo));
    setSavingCliq(false);
    if(!ok)return;
    showMsg(lang==="ar"?"تم الحفظ":"Settings saved!");
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

  if(checkingSession||!isAuthenticated)return(
    <div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Jost,sans-serif"}}>
      <p style={{color:textSub,fontSize:13}}>{lang==="ar"?"جارِ التحقق…":"Checking session…"}</p>
    </div>
  );

  return(
    <div style={{fontFamily:"Jost,sans-serif",background:bg,minHeight:"100vh",color:text,direction:lang==="ar"?"rtl":"ltr"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`@keyframes shake{0%,100%{transform:rotate(0)}20%{transform:rotate(15deg)}40%{transform:rotate(-15deg)}60%{transform:rotate(10deg)}80%{transform:rotate(-10deg)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {pinModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={()=>setPinModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:cardBg,border:`1px solid ${border}`,padding:"28px 32px",width:280,textAlign:"center"}}>
            <p style={{fontSize:12,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 16px"}}>{lang==="ar"?"أدخل الرمز السري":"Enter PIN"}</p>
            <input type="password" inputMode="numeric" autoFocus value={pinInput} onChange={e=>{setPinInput(e.target.value);setPinError(false);}} onKeyDown={e=>{if(e.key==="Enter")submitPin();}} style={{width:"100%",textAlign:"center",letterSpacing:6,fontSize:20,border:`1px solid ${pinError?"#EF4444":border}`,padding:"10px 12px",background:dark?"#1E1E1E":"#FDFAF6",color:text,outline:"none",marginBottom:14}} />
            {pinError&&<p style={{color:"#EF4444",fontSize:11,margin:"-8px 0 14px"}}>{lang==="ar"?"رمز خاطئ":"Incorrect PIN"}</p>}
            <button onClick={submitPin} style={{background:"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 28px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif",width:"100%"}}>{lang==="ar"?"تأكيد":"Confirm"}</button>
          </div>
        </div>
      )}
      {actionLoading&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
          <div style={{width:48,height:48,border:"4px solid rgba(255,255,255,0.25)",borderTopColor:"#D4A84B",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
        </div>
      )}
      <nav style={{background:navBg,height:64,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",position:"sticky",top:0,zIndex:100}}>
        <span style={{fontFamily:"Cormorant Garamond,serif",fontSize:20,color:"#E8DFD0",letterSpacing:3}}>JOUD ALOUD</span>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {/* Desktop nav */}
          <div className="admin-desktop-nav">
            {/* Notification bell */}
            <div style={{position:"relative"}}>
              <button onClick={()=>setNotifOpen(o=>!o)} style={{position:"relative",cursor:"pointer",padding:"7px 10px",background:"none",border:"none",animation:bellRing?"shake 0.5s ease":"none"}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4C4B0" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                {pending>0&&<span style={{position:"absolute",top:2,right:4,background:"#EF4444",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,border:"2px solid "+navBg}}>{pending}</span>}
              </button>
              {notifOpen&&(
                <>
                  <div onClick={()=>setNotifOpen(false)} style={{position:"fixed",inset:0,zIndex:199}} />
                  <div className="notif-dropdown" style={{position:"absolute",top:"100%",right:0,marginTop:6,width:300,maxWidth:"calc(100vw - 32px)",maxHeight:380,overflowY:"auto",background:cardBg,border:`1px solid ${border}`,boxShadow:"0 8px 24px rgba(0,0,0,0.25)",zIndex:200}}>
                    <div style={{padding:"12px 16px",borderBottom:`1px solid ${border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:text,fontWeight:600}}>{lang==="ar"?"الإشعارات":"Notifications"}</span>
                      <button onClick={()=>{setActiveTab("orders");setOrderFilter("pending");setNotifOpen(false);}} style={{background:"none",border:"none",color:accent,fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>{lang==="ar"?"عرض المعلقة":"View pending"}</button>
                    </div>
                    {notifHistory.length===0?(
                      <p style={{padding:16,fontSize:12,color:textSub,margin:0,textAlign:"center"}}>{lang==="ar"?"لا توجد إشعارات":"No notifications yet"}</p>
                    ):notifHistory.map((n,i)=>(
                      <div key={i} style={{padding:"10px 16px",borderBottom:i<notifHistory.length-1?`1px solid ${border}`:"none"}}>
                        <p style={{fontSize:12,color:text,margin:"0 0 3px"}}>{n.msg}</p>
                        <p style={{fontSize:10,color:textSub,margin:0}}>{new Date(n.time).toLocaleString(lang==="ar"?"ar":"en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <a href="https://joudaloud.com" target="_blank" rel="noopener noreferrer" style={{background:"transparent",border:"1px solid transparent",color:"#D4C4B0",padding:"7px 14px",fontSize:12,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:500,textDecoration:"none"}}>
              {lang==="ar"?"الموقع":"Website"}
            </a>
            <button onClick={()=>openTab("settings")} style={{background:"transparent",border:activeTab==="settings"?`1px solid ${accent}`:"1px solid transparent",color:activeTab==="settings"?accent:"#D4C4B0",padding:"7px 14px",fontSize:12,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:500}}>
              {lang==="ar"?"الإعدادات":"Settings"}
            </button>
            <button onClick={()=>setLang(l=>l==="en"?"ar":"en")} style={{background:"transparent",border:"1px solid #6A5A48",color:"#D4C4B0",padding:"6px 16px",fontSize:11,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:500}}>{lang==="en"?"العربية":"English"}</button>
            <button onClick={()=>setDark(d=>!d)} style={{background:"transparent",border:"1px solid #6A5A48",color:"#D4C4B0",padding:"6px 16px",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center"}}>{<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="5"/><path d="M12 7V5M12 19v-2M7 12H5M19 12h-2M8.5 8.5 7 7M17 17l-1.5-1.5M8.5 15.5 7 17M17 7l-1.5 1.5"/><path d="M12 7a5 5 0 0 1 0 10V7z" fill="currentColor" stroke="none"/></svg>}</button>
            <button onClick={()=>{handleLogout();setActiveTab("orders");setOrderFilter("all");}} style={{background:"transparent",border:"1px solid #6A5A48",color:"#D4C4B0",padding:"6px 16px",fontSize:11,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:500}}>{lang==="ar"?"خروج":"Logout"}</button>
          </div>
          {/* Hamburger — mobile */}
          <button className="admin-mobile-btn" onClick={()=>setAdminMenu(m=>!m)} style={{background:"none",border:"none",cursor:"pointer",padding:6,alignItems:"center",justifyContent:"center"}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4C4B0" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </nav>
      {/* Admin mobile dropdown */}
      <div className={`admin-mobile-dropdown${adminMenu?" open":""}`}>
        <a href="https://joudaloud.com" target="_blank" rel="noopener noreferrer" style={{background:"none",border:"none",color:"#D4C4B0",padding:"10px 0",fontSize:13,cursor:"pointer",fontFamily:"Jost,sans-serif",textAlign:lang==="ar"?"right":"left",textDecoration:"none",display:"block"}}>
          {lang==="ar"?"الموقع":"Website"}
        </a>
        <button onClick={()=>{openTab("settings");setAdminMenu(false);}} style={{background:"none",border:"none",color:activeTab==="settings"?accent:"#D4C4B0",padding:"10px 0",fontSize:13,cursor:"pointer",fontFamily:"Jost,sans-serif",textAlign:lang==="ar"?"right":"left"}}>
          {lang==="ar"?"الإعدادات":"Settings"}
        </button>
        <div style={{borderTop:"1px solid #6A5A48",margin:"6px 0"}} />
        <button onClick={()=>setLang(l=>l==="en"?"ar":"en")} style={{background:"none",border:"none",color:"#D4C4B0",padding:"10px 0",fontSize:13,cursor:"pointer",fontFamily:"Jost,sans-serif",textAlign:lang==="ar"?"right":"left"}}>{lang==="en"?"العربية":"English"}</button>
        <button onClick={()=>{setDark(d=>!d);setAdminMenu(false);}} style={{background:"none",border:"none",color:"#D4C4B0",padding:"10px 0",fontSize:13,cursor:"pointer",fontFamily:"Jost,sans-serif",textAlign:lang==="ar"?"right":"left"}}><span style={{display:"flex",alignItems:"center",gap:6}}>{dark?"Light":"Dark"}<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="5"/><path d="M12 7V5M12 19v-2M7 12H5M19 12h-2M8.5 8.5 7 7M17 17l-1.5-1.5M8.5 15.5 7 17M17 7l-1.5 1.5"/><path d="M12 7a5 5 0 0 1 0 10V7z" fill="currentColor" stroke="none"/></svg></span></button>
        <button onClick={()=>{handleLogout();setActiveTab("orders");setOrderFilter("all");setAdminMenu(false);}} style={{background:"none",border:"none",color:"#EF4444",padding:"10px 0",fontSize:13,cursor:"pointer",fontFamily:"Jost,sans-serif",textAlign:lang==="ar"?"right":"left"}}>{lang==="ar"?"خروج":"Logout"}</button>
      </div>

      <div className="admin-container" style={{maxWidth:1280,margin:"0 auto",padding:"40px 32px"}}>
        {/* Stats */}
        <div className="grid-4" style={{display:"grid",gap:16,marginBottom:36}}>
          {[
            {key:"orders",label:lang==="ar"?"إجمالي الطلبات":"Total Orders",value:String(orders.length),color:text},
            {key:"pending",label:lang==="ar"?"قيد الانتظار":"Pending",value:String(pending),color:"#F59E0B"},
            {key:"revenue",label:lang==="ar"?"الإيرادات":"Revenue",value:revenue.toFixed(2),suffix:" JOD",color:"#22C55E"},
            {key:"products",label:lang==="ar"?"المنتجات":"Products",value:String(products.length),color:text},
          ].map(s=>(
            <div key={s.label} style={{background:cardBg,border:`1px solid ${border}`,padding:"22px 26px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <p style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 10px"}}>{s.label}</p>
                {s.key==="revenue"&&(
                  <button onClick={()=>{if(revenueUnlocked){setRevenueUnlocked(false);}else{setPinModal("revenue");setPinInput("");setPinError(false);}}} style={{background:"none",border:"none",cursor:"pointer",color:textSub,padding:0,marginBottom:8,display:"flex"}} title={revenueUnlocked?"Hide":"Show"}>
                    {revenueUnlocked?(
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    ):(
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="21" x2="21" y2="3"/></svg>
                    )}
                  </button>
                )}
              </div>
              <p style={{fontFamily:"Jost,sans-serif",fontSize:32,fontWeight:600,color:s.color,margin:0,lineHeight:1}}>
                {s.key==="revenue"&&!revenueUnlocked?"••••":s.value}{(s as any).suffix&&revenueUnlocked&&s.key==="revenue"&&<span style={{fontSize:14,fontFamily:"Jost,sans-serif",marginLeft:4,opacity:0.7}}>{(s as any).suffix}</span>}
                {s.key!=="revenue"&&(s as any).suffix&&<span style={{fontSize:14,fontFamily:"Jost,sans-serif",marginLeft:4,opacity:0.7}}>{(s as any).suffix}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="admin-tabs" style={{display:"flex",borderBottom:`2px solid ${border}`,marginBottom:28,overflowX:"auto",WebkitOverflowScrolling:"touch" as any,background:bg} as any}>
          {(["orders","products","reviews","settings"] as const).map(t=>(
            <button key={t} onClick={()=>openTab(t)} style={{background:"none",border:"none",borderBottom:activeTab===t?`3px solid ${accent}`:"3px solid transparent",padding:"14px 20px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",color:activeTab===t?text:textSub,fontFamily:"Jost,sans-serif",marginBottom:-2,fontWeight:activeTab===t?600:400,whiteSpace:"nowrap",flexShrink:0}}>
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
                  {[...selectedOrders].some(id=>orders.find(o=>o.id===id)?.status!=="delivered"&&orders.find(o=>o.id===id)?.status!=="denied")&&(
                    <button onClick={bulkSendConfirmation} style={{background:"#25D366",color:"#fff",border:"none",padding:"6px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",letterSpacing:1,display:"flex",alignItems:"center",gap:6}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.4c1.4.8 3.1 1.2 4.8 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.4-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3C4.4 15 4 13.5 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8z"/></svg>
                      {lang==="ar"?"إرسال تأكيد للمحدد":"Send Confirmation"}
                    </button>
                  )}
                  {[...selectedOrders].some(id=>{const s=orders.find(o=>o.id===id)?.status;return s&&STATUS_FLOW[s];})&&(
                    <button onClick={bulkAdvance} style={{background:"#22C55E",color:"#fff",border:"none",padding:"6px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",letterSpacing:1}}>
                      {lang==="ar"?"قبول/تقديم المحدد →":"Approve / Advance Selected →"}
                    </button>
                  )}
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
                          <span style={{fontFamily:"Jost,sans-serif",fontSize:20,fontWeight:700,color:"#22C55E"}}>{order.total_price.toFixed(2)} <span style={{fontSize:11,fontFamily:"Jost,sans-serif",opacity:0.7}}>JOD</span></span>
                          <span style={{color:textSub,fontSize:16,cursor:"pointer"}} onClick={()=>setExpandedOrder(isExpanded?null:order.id)}>{isExpanded?"▲":"▼"}</span>
                        </div>
                      </div>

                      {isExpanded&&(
                        <div style={{padding:"0 22px 18px",borderTop:`1px solid ${border}`}}>
                          <div className="grid-2" style={{display:"grid",gap:14,marginTop:14,marginBottom:14}}>
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
                                  {lang==="ar"&&item.nameAr?item.nameAr:item.name} × {item.qty||1} — {((item.price||0)*(item.qty||1)).toFixed(2)} JOD
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Transfer screenshot */}
                          {order.transfer_image_url&&(
                            <div style={{marginBottom:14}}>
                              <p style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,margin:"0 0 8px"}}>{lang==="ar"?"لقطة التحويل":"Transfer Screenshot"}</p>
                              <TransferImage url={order.transfer_image_url} border={border} />
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
                      ?<div style={{position:"relative",width:90,height:90,flexShrink:0}}><img src={pImagePreview} alt="preview" onClick={()=>setLightboxSrc(pImagePreview)} style={{width:90,height:90,objectFit:"cover",border:`1px solid ${border}`,cursor:"zoom-in"}} /><button type="button" onClick={()=>{setPImagePreview("");setPImageFile(null);setPImageKey(k=>k+1);}} style={{position:"absolute",top:-8,right:-8,background:"#EF4444",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button></div>
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
                {/* Gallery: up to 5 additional images */}
                <div style={{marginBottom:18}}>
                  <label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:7,display:"block"}}>{lang==="ar"?"معرض الصور (حتى 5)":"Image Gallery (up to 5)"}</label>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    {pImages.map((img,i)=>(
                      <div key={i} style={{position:"relative",width:74,height:74,flexShrink:0}}>
                        <img src={img.url} alt="" onClick={()=>setLightboxSrc(img.url)} style={{width:74,height:74,objectFit:"cover",border:`1px solid ${border}`,cursor:"zoom-in"}} />
                        <button type="button" onClick={()=>setPImages(arr=>arr.filter((_,j)=>j!==i))} style={{position:"absolute",top:-8,right:-8,background:"#EF4444",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                      </div>
                    ))}
                    {pImages.length<5&&(
                      <div onClick={()=>extraFileInputRef.current?.click()} style={{width:74,height:74,border:`2px dashed ${border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:textSub,fontSize:11,gap:4,flexShrink:0}}>
                        <span style={{fontSize:18}}>+</span><span>{lang==="ar"?"إضافة":"Add"}</span>
                      </div>
                    )}
                  </div>
                  <input ref={extraFileInputRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setPImages(arr=>arr.length<5?[...arr,{url:ev.target?.result as string,file:f}]:arr);};r.readAsDataURL(f);e.target.value="";}} style={{display:"none"}} />
                  <p style={{fontSize:11,color:textSub,marginTop:6}}>{lang==="ar"?"اختياري — يستخدم في معرض صور المنتج":"Optional — used for the product detail gallery"}</p>
                </div>
                <div className="grid-3" style={{display:"grid",gap:14,marginBottom:14}}>
                  {[{l:lang==="ar"?"الاسم (إنجليزي)":"Name (EN)",v:pName,s:setPName,ph:"Oud Al Layl"},{l:lang==="ar"?"الاسم (عربي)":"Name (AR)",v:pNameAr,s:setPNameAr,ph:"عود الليل"}].map(f=>(
                    <div key={f.l}><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{f.l}</label><input value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.ph} style={inp} /></div>
                  ))}
                  <div><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"الفئة":"Category"}</label><select value={pCategory} onChange={e=>setPCategory(e.target.value)} style={{...inp}}>{adminCategories.map(c=><option key={c.slug} value={c.slug}>{lang==="ar"?c.name_ar:c.name}</option>)}</select></div>
                </div>
                <div className="grid-3" style={{display:"grid",gap:14,marginBottom:14}}>
                  <div><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"السعر الأصلي (JOD)":"Original Price"}</label><input value={pPrice} onChange={e=>setPPrice(e.target.value)} placeholder="28" type="number" step="0.001" style={inp} /></div>
                  <div><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"الخصم %":"Discount %"}</label><input value={pDiscount} onChange={e=>setPDiscount(e.target.value)} placeholder="0" type="number" min="0" max="100" style={inp} /></div>
                  <div><label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"السعر النهائي":"Final Price"}</label>
                    <div style={{...inp,background:dark?"#111":"#F0EBE3",display:"flex",alignItems:"center",gap:7}}>
                      {discountPct>0&&<span style={{textDecoration:"line-through",color:textSub,fontSize:12}}>{origPrice.toFixed(2)}</span>}
                      <span style={{color:"#22C55E",fontWeight:700}}>{finalPrice.toFixed(2)} JOD</span>
                      {discountPct>0&&<span style={{background:"#22C55E",color:"#fff",padding:"2px 6px",fontSize:10,fontWeight:700,marginLeft:"auto"}}>-{discountPct}%</span>}
                    </div>
                  </div>
                </div>
                <div className="grid-2" style={{display:"grid",gap:14,marginBottom:20}}>
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
                  {(lang==="ar"?["","","الاسم","العربي","الفئة","السعر","الحالة","الإجراءات"]:["","","Name","Arabic","Category","Price","Status","Actions"]).map(h=>(
                    <th key={h} style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,padding:"14px 16px",textAlign:lang==="ar"?"right":"left",fontWeight:500,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {products.map((p,idx)=>{
                    const hasDiscount=p.discount>0;
                    const orig=p.original_price||p.price;
                    return(
                      <tr key={p.id} draggable onDragStart={()=>setDragIndex(idx)} onDragOver={e=>e.preventDefault()} onDrop={()=>handleProductDrop(idx)} style={{borderBottom:`1px solid ${border}`,opacity:dragIndex===idx?0.4:1,cursor:"move"}}>
                        <td style={{padding:"12px 8px",width:24,color:textSub,fontSize:16,textAlign:"center"}}>⠿</td>
                        <td style={{padding:"12px 16px",width:68}}>{p.image_url?<img src={p.image_url} alt="" onClick={()=>setLightboxSrc(p.image_url!)} style={{width:52,height:52,objectFit:"cover",border:`1px solid ${border}`,display:"block",cursor:"zoom-in"}} />:<span style={{fontSize:24,display:"block",textAlign:"center"}}>{p.emoji||"🪔"}</span>}</td>
                        <td style={{padding:"12px 16px"}}><strong style={{fontSize:14,color:text,display:"block"}}>{p.name}</strong><span style={{fontSize:11,color:textSub}}>{(p.desc||"").substring(0,40)}{(p.desc?.length||0)>40?"…":""}</span></td>
                        <td style={{padding:"12px 16px",fontSize:14,direction:"rtl",color:text,textAlign:"center"}}>{p.nameAr}</td>
                        <td style={{padding:"12px 16px"}}><span style={{background:p.category==="perfume"?(dark?"#2A1800":"#FEF9EC"):(dark?"#001830":"#EEF2FF"),color:p.category==="perfume"?"#D97706":"#6366F1",padding:"4px 10px",fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>{p.category}</span></td>
                        <td style={{padding:"12px 16px",whiteSpace:"nowrap"}}>
                          {hasDiscount&&<span style={{textDecoration:"line-through",color:textSub,fontSize:12,display:"block"}}>{Number(orig).toFixed(2)} JOD</span>}
                          <span style={{fontWeight:700,fontSize:14,color:"#22C55E"}}>{Number(p.price).toFixed(2)} JOD</span>
                        </td>
                        <td style={{padding:"12px 16px",whiteSpace:"nowrap"}}>
                          {p.out_of_stock?<span style={{background:"#FEF3C7",color:"#F59E0B",padding:"3px 9px",fontSize:10,fontWeight:700,letterSpacing:1}}>{lang==="ar"?"غير متوفر":"OUT OF STOCK"}</span>
                          :p.sold_out?<span style={{background:"#FEF2F2",color:"#EF4444",padding:"3px 9px",fontSize:10,fontWeight:700,letterSpacing:1}}>{lang==="ar"?"تم البيع":"SOLD OUT"}</span>
                          :<span style={{background:dark?"#002A00":"#DCFCE7",color:"#22C55E",padding:"3px 9px",fontSize:10,fontWeight:700}}>{lang==="ar"?"متوفر":"AVAILABLE"}</span>}
                          <div style={{display:"flex",gap:4,marginTop:6}}>
                            <button onClick={()=>toggleStock(p.id,"out_of_stock",!!p.out_of_stock)} style={{background:p.out_of_stock?"#F59E0B":"transparent",color:p.out_of_stock?"#fff":textSub,border:`1px solid ${p.out_of_stock?"#F59E0B":border}`,padding:"3px 8px",fontSize:9,cursor:"pointer",fontFamily:"Jost,sans-serif",letterSpacing:0.5}}>
                              {p.out_of_stock?"✓ ":""}OOS
                            </button>
                            <button onClick={()=>toggleStock(p.id,"sold_out",!!p.sold_out)} style={{background:p.sold_out?"#EF4444":"transparent",color:p.sold_out?"#fff":textSub,border:`1px solid ${p.sold_out?"#EF4444":border}`,padding:"3px 8px",fontSize:9,cursor:"pointer",fontFamily:"Jost,sans-serif",letterSpacing:0.5}}>
                              {p.sold_out?"✓ ":""}SOLD
                            </button>
                          </div>
                        </td>
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
            <div className="grid-3" style={{display:"grid",gap:14,marginBottom:28}}>
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
                        <button onClick={async()=>{if(!await runAction(()=>setReviewStatus(r.id,"approved")))return;fetchReviews();showMsg("Approved");}} style={{background:"#22C55E",color:"#fff",border:"none",padding:"8px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>✓</button>
                        <button onClick={async()=>{if(!await runAction(()=>setReviewStatus(r.id,"denied")))return;fetchReviews();showMsg("Denied");}} style={{background:dark?"#2A0000":"#FEF2F2",border:"1px solid #EF4444",color:"#EF4444",padding:"8px 16px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600}}>✕</button>
                      </>}
                      <button onClick={async()=>{if(!await runAction(()=>deleteReview(r.id)))return;fetchReviews();showMsg("Deleted");}} style={{background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"8px 12px",fontSize:11,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>🗑</button>
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
                    <span style={{fontSize:14,color:"#22C55E",fontWeight:600}}>{typeof o.total_price==="number"?o.total_price.toFixed(2):o.total_price} JOD</span>
                  </div>
                ))}
                {orders.filter(o=>o.status==="delivered"||o.status==="confirmed"||o.status==="shipped").length===0&&(
                  <p style={{color:textSub,fontSize:12,textAlign:"center",padding:20}}>{lang==="ar"?"لا توجد معاملات":"No transactions yet"}</p>
                )}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:`2px solid ${accent}`}}>
                <span style={{fontSize:12,letterSpacing:2,textTransform:"uppercase",color:accent,fontWeight:600}}>{lang==="ar"?"الإجمالي":"Total Revenue"}</span>
                <span style={{fontFamily:"Jost,sans-serif",fontSize:22,fontWeight:700,color:"#22C55E"}}>{revenue.toFixed(2)} JOD</span>
              </div>
            </div>

            {/* Two-column settings */}
            <div className="grid-2" style={{display:"grid",gap:20,alignItems:"start"}}>

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

              {/* CliQ Info */}
              <SettingsCard title={lang==="ar"?"معلومات CliQ":"CliQ Info"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <div style={{display:"grid",gap:12,marginBottom:14}}>
                  <div>
                    <label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"الأليياس":"CliQ Alias"} <span style={{color:"#EF4444"}}>*</span></label>
                    <input type="text" required value={cliqInfo.alias} onChange={e=>setCliqInfo(c=>({...c,alias:e.target.value}))} style={inp} />
                  </div>
                  <div>
                    <label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"البنك":"Bank"} <span style={{color:"#EF4444"}}>*</span></label>
                    <input type="text" required value={cliqInfo.bank} onChange={e=>setCliqInfo(c=>({...c,bank:e.target.value}))} style={inp} />
                  </div>
                  <div>
                    <label style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:textSub,marginBottom:5,display:"block"}}>{lang==="ar"?"الاسم الذي يظهر عند التحويل":"Name shown on transfer"} <span style={{color:"#EF4444"}}>*</span></label>
                    <input type="text" required value={cliqInfo.retrievedName} onChange={e=>setCliqInfo(c=>({...c,retrievedName:e.target.value}))} style={inp} />
                  </div>
                </div>
                <button onClick={saveCliqInfo} disabled={savingCliq} style={{background:savingCliq?"#555":"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:savingCliq?"not-allowed":"pointer",fontFamily:"Jost,sans-serif"}}>
                  {savingCliq?(lang==="ar"?"حفظ...":"Saving..."):(lang==="ar"?"حفظ":"Save")}
                </button>
              </SettingsCard>

              <SettingsCard title={lang==="ar"?"الأمان":"Security"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <div style={{display:"grid",gap:12,marginBottom:14}}>
                  <p style={{fontSize:11,letterSpacing:1,textTransform:"uppercase",color:textSub,margin:0}}>{lang==="ar"?"تغيير رمز PIN":"Change PIN"}</p>
                  <input type="password" inputMode="numeric" placeholder={lang==="ar"?"الرمز الحالي":"Current PIN"} value={curPin} onChange={e=>setCurPin(e.target.value)} style={inp} />
                  <input type="password" inputMode="numeric" placeholder={lang==="ar"?"الرمز الجديد":"New PIN"} value={newPin} onChange={e=>setNewPin(e.target.value)} style={inp} />
                  <input type="password" inputMode="numeric" placeholder={lang==="ar"?"تأكيد الرمز الجديد":"Confirm new PIN"} value={confirmPin} onChange={e=>setConfirmPin(e.target.value)} style={inp} />
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={changePin} disabled={savingPin} style={{background:savingPin?"#555":"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:savingPin?"not-allowed":"pointer",fontFamily:"Jost,sans-serif"}}>
                      {savingPin?(lang==="ar"?"حفظ...":"Saving..."):(lang==="ar"?"تغيير الرمز":"Change PIN")}
                    </button>
                    <button onClick={resetPin} disabled={savingPin} style={{background:"none",color:text,border:`1px solid ${border}`,padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:savingPin?"not-allowed":"pointer",fontFamily:"Jost,sans-serif"}}>
                      {lang==="ar"?"إعادة تعيين إلى 1111":"Reset to 1111"}
                    </button>
                  </div>
                </div>
                <div style={{display:"grid",gap:12,marginBottom:14,paddingTop:14,borderTop:`1px solid ${border}`}}>
                  <p style={{fontSize:11,letterSpacing:1,textTransform:"uppercase",color:textSub,margin:0}}>{lang==="ar"?"تغيير البريد الإلكتروني":"Change Email"} {userEmail&&<span style={{color:textSub,textTransform:"none",letterSpacing:0}}>({userEmail})</span>}</p>
                  <input type="email" placeholder={lang==="ar"?"البريد الإلكتروني الجديد":"New email"} value={newEmail} onChange={e=>setNewEmail(e.target.value)} style={inp} />
                  <button onClick={changeEmail} disabled={savingEmail} style={{background:savingEmail?"#555":"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:savingEmail?"not-allowed":"pointer",fontFamily:"Jost,sans-serif",width:"fit-content"}}>
                    {savingEmail?(lang==="ar"?"إرسال...":"Sending..."):(lang==="ar"?"تغيير البريد":"Change Email")}
                  </button>
                  <p style={{fontSize:11,color:textSub,margin:0}}>{lang==="ar"?"سيتم إرسال رابط تأكيد إلى البريد الجديد":"A confirmation link will be sent to the new email"}</p>
                </div>
                <div style={{display:"grid",gap:12,paddingTop:14,borderTop:`1px solid ${border}`}}>
                  <p style={{fontSize:11,letterSpacing:1,textTransform:"uppercase",color:textSub,margin:0}}>{lang==="ar"?"تغيير كلمة المرور":"Change Password"}</p>
                  <input type="password" placeholder={lang==="ar"?"كلمة المرور الحالية":"Current password"} value={curPassword} onChange={e=>setCurPassword(e.target.value)} style={inp} />
                  <input type="password" placeholder={lang==="ar"?"كلمة المرور الجديدة":"New password"} value={newPassword} onChange={e=>setNewPassword(e.target.value)} style={inp} />
                  <input type="password" placeholder={lang==="ar"?"تأكيد كلمة المرور":"Confirm new password"} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={inp} />
                  <button onClick={changePassword} disabled={savingPassword} style={{background:savingPassword?"#555":"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:savingPassword?"not-allowed":"pointer",fontFamily:"Jost,sans-serif",width:"fit-content"}}>
                    {savingPassword?(lang==="ar"?"حفظ...":"Saving..."):(lang==="ar"?"تغيير كلمة المرور":"Change Password")}
                  </button>
                </div>
              </SettingsCard>

              {/* Categories */}
              <SettingsCard title={lang==="ar"?"الفئات":"Categories"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <div style={{marginBottom:12}}>
                  {adminCategories.map(c=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${border}`}}>
                      <div><span style={{fontSize:13,color:text,fontWeight:600}}>{c.name}</span> <span style={{fontSize:11,color:textSub,direction:"rtl"}}>{c.name_ar}</span></div>
                      <button onClick={async()=>{if(!await runAction(()=>deleteCategory(c.id)))return;fetchCategories();}} style={{background:"transparent",border:"none",color:"#EF4444",padding:"2px 8px",fontSize:12,cursor:"pointer"}}>x</button>
                    </div>
                  ))}
                </div>
                <div className="grid-2" style={{display:"grid",gap:8,marginBottom:10}}>
                  <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} placeholder="Name" style={{...inp,fontSize:12,padding:"8px 10px"}} />
                  <input value={newCatAr} onChange={e=>setNewCatAr(e.target.value)} placeholder="عربي" dir="rtl" style={{...inp,fontSize:12,padding:"8px 10px"}} />
                </div>
                <input value={newCatSlug} onChange={e=>setNewCatSlug(e.target.value.toLowerCase().replace(/\s+/g,"-"))} placeholder="slug (e.g. bakhoor)" style={{...inp,fontSize:12,padding:"8px 10px",marginBottom:10}} />
                <button onClick={async()=>{if(!newCatName||!newCatSlug)return;if(!await runAction(()=>addCategory(newCatName,newCatAr,newCatSlug)))return;setNewCatName("");setNewCatAr("");setNewCatSlug("");fetchCategories();showMsg("Added");}} style={{background:"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 20px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                  + {lang==="ar"?"إضافة":"Add"}
                </button>
              </SettingsCard>

              {/* WhatsApp Approve Message */}
              <SettingsCard title={lang==="ar"?"رسالة القبول":"Approve Message"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <p style={{fontSize:10,color:textSub,marginBottom:8}}>{"{name}"} = customer, {"{total}"} = total</p>
                <textarea value={waApproveMsg} onChange={e=>setWaApproveMsg(e.target.value)} rows={4} style={{...inp,resize:"vertical" as const,fontSize:12,marginBottom:10}} />
                <button onClick={async()=>{if(!await runAction(()=>saveSetting("wa_messages",{approve:waApproveMsg,deny:waDenyMsg})))return;showMsg("Saved!");}} style={{background:"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                  {lang==="ar"?"حفظ":"Save"}
                </button>
              </SettingsCard>

              {/* WhatsApp Deny Message */}
              <SettingsCard title={lang==="ar"?"رسالة الرفض":"Deny Message"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <p style={{fontSize:10,color:textSub,marginBottom:8}}>{"{name}"} = customer, {"{reason}"} = reason</p>
                <textarea value={waDenyMsg} onChange={e=>setWaDenyMsg(e.target.value)} rows={4} style={{...inp,resize:"vertical" as const,fontSize:12,marginBottom:10}} />
                <button onClick={async()=>{if(!await runAction(()=>saveSetting("wa_messages",{approve:waApproveMsg,deny:waDenyMsg})))return;showMsg("Saved!");}} style={{background:"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 24px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                  {lang==="ar"?"حفظ":"Save"}
                </button>
              </SettingsCard>

              {/* Promo Codes */}
              <SettingsCard title={lang==="ar"?"أكواد الخصم":"Promo Codes"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <div style={{marginBottom:12}}>
                  {promoCodes.map(c=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${border}`,gap:8}}>
                      <div><span style={{fontSize:13,color:text,fontWeight:600,letterSpacing:1}}>{c.code}</span> <span style={{fontSize:11,color:textSub}}>-{c.discount_percent}%</span></div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <button onClick={async()=>{if(!await runAction(()=>togglePromoCode(c.id,c.active)))return;fetchPromoCodes();}} style={{background:c.active?(dark?"#002A00":"#DCFCE7"):(dark?"#2A0000":"#FEF2F2"),color:c.active?"#22C55E":"#EF4444",border:"none",padding:"3px 9px",fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif"}}>
                          {c.active?(lang==="ar"?"مفعل":"ACTIVE"):(lang==="ar"?"معطل":"INACTIVE")}
                        </button>
                        <button onClick={async()=>{if(!confirm(lang==="ar"?"حذف هذا الكود؟":"Delete this code?"))return;if(!await runAction(()=>deletePromoCode(c.id)))return;fetchPromoCodes();}} style={{background:"transparent",border:"none",color:"#EF4444",padding:"2px 8px",fontSize:12,cursor:"pointer"}}>x</button>
                      </div>
                    </div>
                  ))}
                  {promoCodes.length===0&&<p style={{color:textSub,fontSize:12,padding:"8px 0",margin:0}}>{lang==="ar"?"لا توجد أكواد":"No promo codes yet"}</p>}
                </div>
                <div className="grid-2" style={{display:"grid",gap:8,marginBottom:10}}>
                  <input value={newPromoCode} onChange={e=>setNewPromoCode(e.target.value.toUpperCase())} placeholder={lang==="ar"?"الكود":"CODE"} style={{...inp,fontSize:12,padding:"8px 10px",letterSpacing:1}} />
                  <input value={newPromoDiscount} onChange={e=>setNewPromoDiscount(e.target.value)} placeholder={lang==="ar"?"نسبة الخصم %":"Discount %"} type="number" min="0" max="100" style={{...inp,fontSize:12,padding:"8px 10px"}} />
                </div>
                <button disabled={savingPromo} onClick={async()=>{
                  const code=newPromoCode.trim();const pct=parseFloat(newPromoDiscount);
                  if(!code||!pct||pct<=0||pct>100){showMsg(lang==="ar"?"أدخل كودًا ونسبة خصم صحيحة":"Enter a valid code and discount %");return;}
                  setSavingPromo(true);
                  const ok=await runAction(()=>addPromoCode(code,pct));
                  setSavingPromo(false);
                  if(!ok)return;
                  setNewPromoCode("");setNewPromoDiscount("");fetchPromoCodes();showMsg(lang==="ar"?"تمت الإضافة":"Added");
                }} style={{background:savingPromo?"#555":"#1C1510",color:"#E8DFD0",border:"none",padding:"10px 20px",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:savingPromo?"not-allowed":"pointer",fontFamily:"Jost,sans-serif"}}>
                  + {lang==="ar"?"إضافة":"Add"}
                </button>
              </SettingsCard>

              {/* Maintenance Mode */}
              <SettingsCard title={lang==="ar"?"وضع الصيانة":"Maintenance Mode"} accent={accent} cardBg={cardBg} border={border} text={text} dark={dark}>
                <p style={{fontSize:12,color:textSub,marginBottom:14}}>{lang==="ar"?"عند التفعيل، سيتم عرض رسالة صيانة لجميع الزوار بدلاً من المتجر.":"When enabled, all visitors see a maintenance message instead of the store."}</p>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <button onClick={async()=>{
                    const next=!maintenanceMode;
                    setSavingMaintenance(true);
                    const ok=await runAction(()=>saveSetting("maintenance_mode",next));
                    setSavingMaintenance(false);
                    if(!ok)return;
                    setMaintenanceMode(next);showMsg(lang==="ar"?"تم الحفظ":"Saved!");
                  }} disabled={savingMaintenance} style={{position:"relative",width:50,height:28,borderRadius:14,border:"none",background:maintenanceMode?"#22C55E":(dark?"#333":"#D4C4B0"),cursor:savingMaintenance?"not-allowed":"pointer",transition:"background 0.2s",flexShrink:0}}>
                    <span style={{position:"absolute",top:3,left:maintenanceMode?25:3,width:22,height:22,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}} />
                  </button>
                  <span style={{fontSize:13,color:text,fontWeight:600}}>{maintenanceMode?(lang==="ar"?"مفعل":"Enabled"):(lang==="ar"?"معطل":"Disabled")}</span>
                </div>
              </SettingsCard>
            </div>
          </div>
        )}
      </div>

      {/* BULK CONFIRMATION SEND — each send is its own click so browsers don't block the popup */}
      {confirmModal&&(
        <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(0,0,0,0.6)"}} onClick={()=>setConfirmModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:cardBg,border:`1px solid ${border}`,padding:"28px 32px",width:"100%",maxWidth:440,maxHeight:"80vh",overflowY:"auto"}}>
            <h3 style={{fontFamily:"Cormorant Garamond,serif",fontSize:20,fontWeight:300,color:text,marginBottom:6,marginTop:0}}>{lang==="ar"?"إرسال رسائل تأكيد":"Send Confirmation Messages"}</h3>
            <p style={{fontSize:12,color:textSub,marginBottom:18}}>{lang==="ar"?"بسبب قيود المتصفح، اضغط إرسال لكل عميل على حدة — كل رسالة مخصصة باسمه ومجموعه.":"Due to browser limits, click Send for each customer individually — each message is personalized to their own name and total."}</p>
            {confirmModal.map(order=>(
              <div key={order.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${border}`}}>
                <div>
                  <p style={{fontSize:13,color:text,margin:"0 0 2px",fontWeight:600}}>{order.customer_name}</p>
                  <p style={{fontSize:11,color:textSub,margin:0}}>#{order.id} · {order.phone} · {typeof order.total_price==="number"?order.total_price.toFixed(2):order.total_price} JOD</p>
                </div>
                <button onClick={()=>{waConfirm(order);setConfirmSent(s=>new Set(s).add(order.id));}} style={{background:confirmSent.has(order.id)?"#9A8B7A":"#25D366",color:"#fff",border:"none",padding:"8px 16px",fontSize:11,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",fontWeight:600,whiteSpace:"nowrap"}}>
                  {confirmSent.has(order.id)?(lang==="ar"?"تم الإرسال ✓":"Sent ✓"):(lang==="ar"?"إرسال":"Send")}
                </button>
              </div>
            ))}
            <button onClick={()=>{setConfirmModal(null);clearSelection();}} style={{marginTop:18,background:"transparent",border:`1px solid ${border}`,color:textSub,padding:"8px 20px",fontSize:11,letterSpacing:1,cursor:"pointer",fontFamily:"Jost,sans-serif",width:"100%"}}>{lang==="ar"?"تم":"Done"}</button>
          </div>
        </div>
      )}
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

      {lightboxSrc&&(
        <div onClick={()=>setLightboxSrc(null)} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}>
          <img src={lightboxSrc} alt="preview" style={{maxWidth:"100%",maxHeight:"90vh",objectFit:"contain",boxShadow:"0 8px 48px rgba(0,0,0,0.8)"}} onClick={e=>e.stopPropagation()} />
          <button onClick={()=>setLightboxSrc(null)} style={{position:"fixed",top:20,right:20,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:40,height:40,borderRadius:"50%",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
      )}

      {toast&&<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"#1C1510",color:"#E8DFD0",padding:"13px 28px",fontSize:12,letterSpacing:1,zIndex:999,border:`1px solid ${accent}`,whiteSpace:"nowrap"}}>{toast}</div>}
    </div>
  );
}