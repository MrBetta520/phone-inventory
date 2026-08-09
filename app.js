"use strict";

const STORAGE_KEYS={products:"phone_inventory_products_v1",phones:"phone_inventory_phones_v1",adjustments:"phone_inventory_adjustments_v1"};
const CUSTOMERS=["LEE","AARON","XIE","ZENG"];
const STATUS={IN_STOCK:"库存中",SHIPPED:"已出库"};
const NY_TIME_ZONE="America/New_York";
const DEFAULT_PRODUCTS=[
 {upc:"195950685784",model:"iPhone 16 Pro Max",color:"沙漠金色",capacity:"256GB"},
 {upc:"195950385417",model:"iPhone 16 Pro",color:"原色钛金属",capacity:"256GB"},
 {upc:"195950637151",model:"iPhone 17 Pro Max",color:"银色",capacity:"256GB"},
 {upc:"195950626162",model:"iPhone 17 Pro",color:"银色",capacity:"256GB"},
 {upc:"195950638035",model:"iPhone 17 Pro Max",color:"橙色",capacity:"512GB"},
 {upc:"195950638028",model:"iPhone 17 Pro Max",color:"银色",capacity:"512GB"},
 {upc:"195950638011",model:"iPhone 17 Pro Max",color:"蓝色",capacity:"256GB"},
 {upc:"195950638004",model:"iPhone 17 Pro Max",color:"橙色",capacity:"256GB"}
];
const VIEW_CONTENT={
 receive:["入库扫码","选择客户后，按顺序扫描三个条码"],customerStock:["客户库存总表","按客户分组显示各型号当前数量"],
 adjust:["期初 / 调整库存","录入旧库存或手动增加、减少数量"],stock:["逐台库存","查看扫码手机的完整记录"],
 ship:["出库管理","保留逐台确认出库功能"],products:["UPC 型号库","维护 UPC 与手机型号的对应关系"]
};

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function read(key,fallback){try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback}catch(e){console.error(e);return fallback}}
function mergeProducts(saved){const codes=new Set(saved.map(x=>x.upc));return [...DEFAULT_PRODUCTS.filter(x=>!codes.has(x.upc)),...saved]}
let products=mergeProducts(read(STORAGE_KEYS.products,[]));
let phones=read(STORAGE_KEYS.phones,[]).map(p=>({...p,customer:p.customer||"未分配"}));
let adjustments=read(STORAGE_KEYS.adjustments,[]);

function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function formatDate(v){if(!v)return "";return new Intl.DateTimeFormat("zh-CN",{timeZone:NY_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(v))}
function dateKey(v=new Date()){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:NY_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(v));const get=t=>parts.find(p=>p.type===t).value;return `${get("year")}-${get("month")}-${get("day")}`}
function productKey(x){return [x.customer,x.model,x.color,x.capacity].join("\u001f")}
function customerRank(name){const i=CUSTOMERS.indexOf(name);return i<0?999:i}
function compareStock(a,b){return customerRank(a.customer)-customerRank(b.customer)||a.customer.localeCompare(b.customer)||a.model.localeCompare(b.model)||a.capacity.localeCompare(b.capacity)||a.color.localeCompare(b.color)}
function save(){localStorage.setItem(STORAGE_KEYS.products,JSON.stringify(products));localStorage.setItem(STORAGE_KEYS.phones,JSON.stringify(phones));localStorage.setItem(STORAGE_KEYS.adjustments,JSON.stringify(adjustments));render()}
function ensureXlsx(){if(typeof XLSX==="undefined"){alert("Excel 导出组件加载失败，请检查网络后刷新页面。");return false}return true}
function autoWidth(rows){return rows[0].map((_,i)=>({wch:Math.min(34,Math.max(10,...rows.map(r=>String(r[i]??"").length+2)))}))}
function writeXlsx(rows,sheet,file){if(!ensureXlsx())return;const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=autoWidth(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheet);XLSX.writeFile(wb,file)}

function currentStock(){
 const map=new Map();
 const add=(item,delta)=>{const key=productKey(item);if(!map.has(key))map.set(key,{customer:item.customer,model:item.model,color:item.color,capacity:item.capacity,quantity:0});map.get(key).quantity+=delta};
 phones.forEach(p=>{if(p.status===STATUS.IN_STOCK)add(p,1)});
 adjustments.forEach(a=>add(a,a.type==="decrease"?-a.quantity:a.quantity));
 return [...map.values()].filter(x=>x.quantity!==0).sort(compareStock);
}
function quantityFor(item){return currentStock().find(x=>productKey(x)===productKey(item))?.quantity||0}
function scannedToday(customer){return phones.filter(p=>p.customer===customer&&dateKey(p.receivedAt)===dateKey())}
function totalCurrent(){return currentStock().reduce((sum,x)=>sum+x.quantity,0)}

function render(){const stock=currentStock();const today=phones.filter(p=>dateKey(p.receivedAt)===dateKey()).length;$("#stockCount").textContent=totalCurrent();$("#todayCount").textContent=today;$("#shippedCount").textContent=phones.filter(p=>p.status===STATUS.SHIPPED).length;$("#modelCount").textContent=stock.length;renderStats(stock);renderRecent();renderPhoneTables();renderCustomerStock(stock);renderAdjustments();renderProducts();refreshAdjustmentModels()}
function renderStats(stock){const el=$("#stats");if(!stock.length){el.innerHTML='<div class="empty">还没有库存数据</div>';return}const max=Math.max(...stock.map(x=>x.quantity));el.innerHTML=stock.slice().sort((a,b)=>b.quantity-a.quantity).slice(0,7).map(x=>`<div class="row"><span><b>${escapeHtml(x.customer)}</b> · ${escapeHtml(x.model)} · ${escapeHtml(x.color)} · ${escapeHtml(x.capacity)}</span><b>${x.quantity}</b></div><div class="bar"><i style="width:${Math.max(8,x.quantity/max*100)}%"></i></div>`).join("")}
function renderRecent(){const el=$("#recent");if(!phones.length){el.innerHTML='<div class="empty">扫码入库后会显示在这里</div>';return}el.innerHTML=phones.slice(0,6).map(p=>`<div class="row"><span><b>${escapeHtml(p.customer)}</b> · ${escapeHtml(p.model)}<br><span class="muted">${escapeHtml(p.color)} · ${escapeHtml(p.capacity)}</span></span><small>${escapeHtml(String(p.imei).slice(-6))}</small></div>`).join("")}
function searchText(p){return [p.customer,p.tracking,p.imei,p.upc,p.model,p.color,p.capacity,p.status].join(" ").toLowerCase()}
function phoneTable(items,ship=false){if(!items.length)return '<div class="empty">没有符合条件的记录</div>';return `<table><thead><tr><th>客户</th><th>手机</th><th>IMEI</th><th>快递单号</th><th>状态</th><th>入库时间</th>${ship?"<th>操作</th>":""}</tr></thead><tbody>${items.map(p=>`<tr><td><b>${escapeHtml(p.customer)}</b></td><td><b>${escapeHtml(p.model)}</b><br><span class="muted">${escapeHtml(p.color)} · ${escapeHtml(p.capacity)}</span></td><td>${escapeHtml(p.imei)}</td><td>${escapeHtml(p.tracking)}</td><td><span class="tag">${escapeHtml(p.status)}</span></td><td>${escapeHtml(formatDate(p.receivedAt))}</td>${ship?`<td><button data-ship="${escapeHtml(p.imei)}">确认出库</button></td>`:""}</tr>`).join("")}</tbody></table>`}
function renderPhoneTables(){const q1=$("#stockSearch").value.trim().toLowerCase(),q2=$("#shipSearch").value.trim().toLowerCase();$("#stockTable").innerHTML=phoneTable(phones.filter(p=>searchText(p).includes(q1)));$("#shipTable").innerHTML=phoneTable(phones.filter(p=>p.status===STATUS.IN_STOCK&&searchText(p).includes(q2)),true);$$('[data-ship]').forEach(b=>b.onclick=()=>shipPhone(b.dataset.ship))}
function renderCustomerStock(stock){const filter=$("#stockCustomerFilter").value;const rows=stock.filter(x=>filter==="ALL"||x.customer===filter);if(!rows.length){$("#customerStockTable").innerHTML='<div class="empty">没有库存数据</div>';return}let previous="";$("#customerStockTable").innerHTML=`<table><thead><tr><th>客户</th><th>型号</th><th>颜色</th><th>容量</th><th>当前数量</th></tr></thead><tbody>${rows.map(x=>{const start=previous&&previous!==x.customer;previous=x.customer;return `<tr class="${start?"customer-start":""}"><td><b>${escapeHtml(x.customer)}</b></td><td>${escapeHtml(x.model)}</td><td>${escapeHtml(x.color)}</td><td>${escapeHtml(x.capacity)}</td><td><b>${x.quantity}</b></td></tr>`}).join("")}</tbody></table>`}
function renderAdjustments(){if(!adjustments.length){$("#adjustmentTable").innerHTML='<div class="empty">还没有调整记录</div>';return}const names={initial:"期初库存",increase:"增加库存",decrease:"减少库存"};$("#adjustmentTable").innerHTML=`<table><thead><tr><th>时间</th><th>客户</th><th>手机</th><th>操作</th><th>数量</th><th>备注</th><th>修正</th></tr></thead><tbody>${adjustments.map(a=>`<tr><td>${escapeHtml(formatDate(a.createdAt))}</td><td><b>${escapeHtml(a.customer)}</b></td><td>${escapeHtml(a.model)} · ${escapeHtml(a.color)} · ${escapeHtml(a.capacity)}</td><td>${names[a.type]}</td><td>${a.type==="decrease"?"−":"+"}${a.quantity}</td><td>${escapeHtml(a.note||"")}</td><td><button class="delete" data-reverse="${escapeHtml(a.id)}">反向修正</button></td></tr>`).join("")}</tbody></table>`;$$('[data-reverse]').forEach(b=>b.onclick=()=>reverseAdjustment(b.dataset.reverse))}
function renderProducts(){const rows=products.map(p=>`<tr><td>${escapeHtml(p.upc)}</td><td><b>${escapeHtml(p.model)}</b></td><td>${escapeHtml(p.color)}</td><td>${escapeHtml(p.capacity)}</td><td><button class="delete" data-delete-upc="${escapeHtml(p.upc)}">删除</button></td></tr>`).join("");$("#productTable").innerHTML=`<table><thead><tr><th>UPC</th><th>型号</th><th>颜色</th><th>容量</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`;$$('[data-delete-upc]').forEach(b=>b.onclick=()=>{if(confirm("确认删除这个 UPC 型号？")){products=products.filter(p=>p.upc!==b.dataset.deleteUpc);save()}})}

function uniqueSorted(values){return [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-CN",{numeric:true}))}
function setSelectOptions(select,values,placeholder,selected=""){
 select.innerHTML=`<option value="">${escapeHtml(placeholder)}</option>`+values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
 if(values.includes(selected))select.value=selected;
 select.disabled=!values.length;
}
function refreshAdjustmentModels(){
 const model=$("#adjustModel"),selected=model.value;
 setSelectOptions(model,uniqueSorted(products.map(p=>p.model)),"请选择型号",selected);
 refreshAdjustmentColors();
}
function refreshAdjustmentColors(){
 const model=$("#adjustModel").value,color=$("#adjustColor"),selected=color.value;
 const colors=uniqueSorted(products.filter(p=>p.model===model).map(p=>p.color));
 setSelectOptions(color,colors,model?"请选择颜色":"请先选择型号",selected);
 refreshAdjustmentCapacities();
}
function refreshAdjustmentCapacities(){
 const model=$("#adjustModel").value,color=$("#adjustColor").value,capacity=$("#adjustCapacity"),selected=capacity.value;
 const capacities=uniqueSorted(products.filter(p=>p.model===model&&p.color===color).map(p=>p.capacity));
 setSelectOptions(capacity,capacities,color?"请选择容量":"请先选择颜色",selected);
}

function receivePhone(){const customer=$("#receiveCustomer").value,tracking=$("#tracking").value.trim(),imei=$("#imei").value.trim(),upc=$("#upc").value.trim(),message=$("#message");if(!customer){message.textContent="⚠️ 请先选择客户";return}if(!tracking||!imei||!upc){message.textContent="⚠️ 三个条码都必须扫描";return}if(phones.some(p=>p.tracking===tracking)){message.textContent="⚠️ 这个快递单号已经录入";return}if(phones.some(p=>p.imei===imei)){message.textContent="⚠️ 这个 IMEI 已经录入";return}const product=products.find(p=>p.upc===upc);if(!product){message.textContent="⚠️ UPC 型号库中没有这个代码，请先添加型号";showView("products");$("#pUpc").value=upc;return}phones.unshift({...product,customer,tracking,imei,status:STATUS.IN_STOCK,receivedAt:new Date().toISOString()});["tracking","imei","upc"].forEach(id=>$("#"+id).value="");message.textContent=`✅ 已为 ${customer} 入库：${product.model} · ${product.color} · ${product.capacity}`;save();$("#tracking").focus()}
function shipPhone(imei){if(!confirm("确认将这部手机标记为已出库？"))return;phones=phones.map(p=>p.imei===imei?{...p,status:STATUS.SHIPPED,shippedAt:new Date().toISOString()}:p);save()}
function submitAdjustment(e){e.preventDefault();const item={id:`adj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,customer:$("#adjustCustomer").value,model:$("#adjustModel").value, color:$("#adjustColor").value,capacity:$("#adjustCapacity").value,type:$("#adjustType").value,quantity:Number($("#adjustQuantity").value),note:$("#adjustNote").value.trim(),createdAt:new Date().toISOString()};if(!item.customer||!item.model||!item.color||!item.capacity){$("#adjustMessage").textContent="请完整选择客户、型号、颜色和容量。";return}if(!Number.isInteger(item.quantity)||item.quantity<1)return;if(item.type==="decrease"&&quantityFor(item)<item.quantity){$("#adjustMessage").textContent=`不能减少 ${item.quantity} 台；该客户此配置当前只有 ${quantityFor(item)} 台。`;return}adjustments.unshift(item);e.currentTarget.reset();$("#adjustMessage").textContent="✅ 库存调整已保存，并已同步到客户库存总表。";save()}
function reverseAdjustment(id){const source=adjustments.find(a=>a.id===id);if(!source)return;const reverseType=source.type==="decrease"?"increase":"decrease";const reverse={...source,id:`adj_${Date.now()}_reverse`,type:reverseType,note:`反向修正：${source.note||source.id}`,createdAt:new Date().toISOString()};if(reverseType==="decrease"&&quantityFor(reverse)<reverse.quantity){alert("当前库存不足，无法进行这笔反向修正。");return}if(confirm("系统会新增一笔相反的调整记录，原记录会保留。确认继续？")){adjustments.unshift(reverse);save()}}
function submitProduct(e){e.preventDefault();const p={upc:$("#pUpc").value.trim(),model:$("#pModel").value.trim(),color:$("#pColor").value.trim(),capacity:$("#pCapacity").value.trim()};products=[p,...products.filter(x=>x.upc!==p.upc)];e.currentTarget.reset();save()}
function importCsv(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{const list=String(reader.result).replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean).slice(1).map(line=>{const [upc,model,color,capacity]=line.split(",").map(v=>v.replace(/^"|"$/g,"").trim());return{upc,model,color,capacity}}).filter(x=>x.upc&&x.model);const codes=new Set(list.map(x=>x.upc));products=[...list,...products.filter(x=>!codes.has(x.upc))];e.target.value="";save()};reader.readAsText(file)}

function exportAll(){const rows=[["快递单号","IMEI","型号","颜色","容量","客户","状态","入库时间","出库时间"],...phones.map(p=>[String(p.tracking||""),String(p.imei||""),p.model,p.color,p.capacity,p.customer,p.status,formatDate(p.receivedAt),formatDate(p.shippedAt)])];writeXlsx(rows,"逐台记录",`手机逐台记录_${dateKey()}.xlsx`)}
function selectedCustomer(){const c=$("#stockCustomerFilter").value;if(c==="ALL"){alert("请先在“查看客户”中选择一个客户。");return null}return c}
function exportToday(){const c=selectedCustomer();if(!c)return;const list=scannedToday(c);if(!list.length){alert(`${c} 今天还没有扫码入库记录。`);return}const rows=[["快递单号","IMEI","型号","颜色","容量","客户","入库时间"],...list.map(p=>[String(p.tracking||""),String(p.imei||""),p.model,p.color,p.capacity,p.customer,formatDate(p.receivedAt)])];writeXlsx(rows,"今日入库",`${c}_今日入库_${dateKey()}.xlsx`)}
function exportStock(){const c=selectedCustomer();if(!c)return;const list=currentStock().filter(x=>x.customer===c);if(!list.length){alert(`${c} 当前没有库存。`);return}const exportedAt=formatDate(new Date());const rows=[["客户","型号","颜色","容量","当前数量","导出时间"],...list.map(x=>[x.customer,x.model,x.color,x.capacity,x.quantity,exportedAt])];writeXlsx(rows,"当前库存",`${c}_当前库存_${dateKey()}.xlsx`)}

function showView(id){$$('.view').forEach(v=>v.classList.toggle("active",v.id===id));$$('nav button').forEach(b=>b.classList.toggle("active",b.dataset.view===id));const content=VIEW_CONTENT[id];$("#title").textContent=content[0];$("#subtitle").textContent=content[1]}
function fillCustomers(){const options=CUSTOMERS.map(c=>`<option value="${c}">${c}</option>`).join("");$("#receiveCustomer").insertAdjacentHTML("beforeend",options);$("#adjustCustomer").insertAdjacentHTML("beforeend",options);$("#stockCustomerFilter").insertAdjacentHTML("beforeend",options);$("#stockCustomerFilter").insertAdjacentHTML("beforeend",'<option value="未分配">未分配（旧数据）</option>')}
function bind(){$$('nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));$("#tracking").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();$("#imei").focus()}};$("#imei").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();$("#upc").focus()}};$("#upc").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();receivePhone()}};$("#receiveBtn").onclick=receivePhone;$("#adjustmentForm").onsubmit=submitAdjustment;$("#adjustModel").onchange=refreshAdjustmentColors;$("#adjustColor").onchange=refreshAdjustmentCapacities;$("#productForm").onsubmit=submitProduct;$("#csvImport").onchange=importCsv;$("#stockSearch").oninput=renderPhoneTables;$("#shipSearch").oninput=renderPhoneTables;$("#stockCustomerFilter").onchange=()=>renderCustomerStock(currentStock());$("#exportAll").onclick=exportAll;$("#exportCustomerToday").onclick=exportToday;$("#exportCustomerStock").onclick=exportStock;$("#receiveCustomer").onchange=()=>{$("#message").textContent=$("#receiveCustomer").value?"请扫描快递单号":"请先选择客户"}}
function init(){fillCustomers();bind();save();$("#receiveCustomer").focus()}
init();
