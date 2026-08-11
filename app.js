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
let dataFileHandle=null;
let saveInProgress=false;

function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function formatDate(v){if(!v)return "";return new Intl.DateTimeFormat("zh-CN",{timeZone:NY_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(v))}
function dateKey(v=new Date()){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:NY_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(v));const get=t=>parts.find(p=>p.type===t).value;return `${get("year")}-${get("month")}-${get("day")}`}
function productKey(x){return [x.customer,x.model,x.color,x.capacity].join("\u001f")}
function customerRank(name){const i=CUSTOMERS.indexOf(name);return i<0?999:i}
function compareStock(a,b){return customerRank(a.customer)-customerRank(b.customer)||a.customer.localeCompare(b.customer)||a.model.localeCompare(b.model)||a.capacity.localeCompare(b.capacity)||a.color.localeCompare(b.color)}
function setFileStatus(status,hint,type=""){$("#fileStatus").textContent=status;$("#fileHint").textContent=hint;$("#fileBar").className=`file-bar ${type}`.trim()}
function requireDataFile(){if(dataFileHandle)return true;setFileStatus("尚未连接库存数据文件","请先点击“创建新数据文件”或“打开已有文件”","error");alert("请先创建或打开库存 Excel 数据文件。");return false}
function rowsToObjects(sheet){return sheet?XLSX.utils.sheet_to_json(sheet,{defval:""}):[]}
function workbookFromData(){
 const wb=XLSX.utils.book_new();
 const sheets={
  "逐台记录":phones.map(p=>({快递单号:String(p.tracking||""),IMEI:String(p.imei||""),UPC:String(p.upc||""),型号:p.model,颜色:p.color,容量:p.capacity,客户:p.customer,状态:p.status,入库时间:p.receivedAt||"",出库时间:p.shippedAt||""})),
  "调整记录":adjustments.map(a=>({记录ID:a.id,客户:a.customer,型号:a.model,颜色:a.color,容量:a.capacity,操作:a.type,数量:a.quantity,备注:a.note||"",创建时间:a.createdAt||""})),
  "UPC型号库":products.map(p=>({UPC:String(p.upc||""),型号:p.model,颜色:p.color,容量:p.capacity})),
  "客户库存总表":currentStock().map(x=>({客户:x.customer,型号:x.model,颜色:x.color,容量:x.capacity,当前数量:x.quantity,更新时间:new Date().toISOString()})),
  "客户名单":CUSTOMERS.map(name=>({客户:name}))
 };
 Object.entries(sheets).forEach(([name,data])=>{const ws=XLSX.utils.json_to_sheet(data.length?data:[{}]);XLSX.utils.book_append_sheet(wb,ws,name)});
 return wb;
}
async function writeDataFile(){
 if(!dataFileHandle||saveInProgress)return false;
 saveInProgress=true;setFileStatus(`正在保存：${dataFileHandle.name}`,"请勿关闭页面…","connected");
 try{const bytes=XLSX.write(workbookFromData(),{bookType:"xlsx",type:"array"});const writable=await dataFileHandle.createWritable();await writable.write(bytes);await writable.close();setFileStatus(`当前数据文件：${dataFileHandle.name}`,`已保存 · ${formatDate(new Date())}`,"connected");return true}
 catch(e){console.error(e);setFileStatus("Excel 文件保存失败","请确认文件没有被 Excel 占用，然后重新打开数据文件","error");alert("保存失败。请关闭正在打开这个文件的 Excel 程序后重试。");return false}
 finally{saveInProgress=false}
}
async function save(){if(!requireDataFile())return false;const ok=await writeDataFile();if(ok)render();return ok}
async function createDataFile(){
 if(!ensureXlsx())return;
 if(!window.showSaveFilePicker){alert("此功能需要桌面版 Chrome 或 Edge，并通过 HTTPS 网页打开。");return}
 try{dataFileHandle=await showSaveFilePicker({suggestedName:"手机库存数据.xlsx",types:[{description:"Excel 工作簿",accept:{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"]}}]});
  const hasOld=phones.length||adjustments.length||read(STORAGE_KEYS.products,[]).length;
  if(!hasOld||!confirm("检测到浏览器中有旧数据。点击“确定”会把旧数据写入新 Excel；点击“取消”会创建空白库存文件。")){products=[...DEFAULT_PRODUCTS];phones=[];adjustments=[]}
  await save();
 }catch(e){if(e.name!=="AbortError"){console.error(e);setFileStatus("创建文件失败",e.message||"请重试","error")}}
}
async function openDataFile(){
 if(!ensureXlsx())return;
 if(!window.showOpenFilePicker){alert("此功能需要桌面版 Chrome 或 Edge，并通过 HTTPS 网页打开。");return}
 try{const [handle]=await showOpenFilePicker({multiple:false,types:[{description:"Excel 工作簿",accept:{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"]}}]});const file=await handle.getFile();const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
  const pr=rowsToObjects(wb.Sheets["UPC型号库"]);const ph=rowsToObjects(wb.Sheets["逐台记录"]);const ad=rowsToObjects(wb.Sheets["调整记录"]);
  products=pr.map(r=>({upc:String(r.UPC||""),model:r["型号"],color:r["颜色"],capacity:r["容量"]})).filter(x=>x.upc&&x.model);
  phones=ph.map(r=>({tracking:String(r["快递单号"]||""),imei:String(r.IMEI||""),upc:String(r.UPC||""),model:r["型号"],color:r["颜色"],capacity:r["容量"],customer:r["客户"],status:r["状态"]||STATUS.IN_STOCK,receivedAt:r["入库时间"]||"",shippedAt:r["出库时间"]||""})).filter(x=>x.imei);
  adjustments=ad.map(r=>({id:r["记录ID"]||`adj_${Date.now()}_${Math.random()}`,customer:r["客户"],model:r["型号"],color:r["颜色"],capacity:r["容量"],type:r["操作"],quantity:Number(r["数量"]),note:r["备注"]||"",createdAt:r["创建时间"]||""})).filter(x=>x.id&&x.model);
  dataFileHandle=handle;setFileStatus(`当前数据文件：${handle.name}`,"文件已载入，可以开始操作","connected");render();
 }catch(e){if(e.name!=="AbortError"){console.error(e);setFileStatus("打开文件失败","文件格式不正确或无法读取","error");alert("无法读取这个库存文件，请确认它是由本系统创建的 .xlsx 文件。")}}
}
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
function renderProducts(){const rows=products.map(p=>`<tr><td>${escapeHtml(p.upc)}</td><td><b>${escapeHtml(p.model)}</b></td><td>${escapeHtml(p.color)}</td><td>${escapeHtml(p.capacity)}</td><td><button class="delete" data-delete-upc="${escapeHtml(p.upc)}">删除</button></td></tr>`).join("");$("#productTable").innerHTML=`<table><thead><tr><th>UPC</th><th>型号</th><th>颜色</th><th>容量</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`;$$('[data-delete-upc]').forEach(b=>b.onclick=async()=>{if(!requireDataFile())return;if(confirm("确认删除这个 UPC 型号？")){products=products.filter(p=>p.upc!==b.dataset.deleteUpc);await save()}})}

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

async function receivePhone(){if(!requireDataFile())return;const customer=$("#receiveCustomer").value,tracking=$("#tracking").value.trim(),imei=$("#imei").value.trim(),upc=$("#upc").value.trim(),message=$("#message");if(!customer){message.textContent="⚠️ 请先选择客户";return}if(!tracking||!imei||!upc){message.textContent="⚠️ 三个条码都必须扫描";return}if(phones.some(p=>p.tracking===tracking)){message.textContent="⚠️ 这个快递单号已经录入";return}if(phones.some(p=>p.imei===imei)){message.textContent="⚠️ 这个 IMEI 已经录入";return}const product=products.find(p=>p.upc===upc);if(!product){message.textContent="⚠️ UPC 型号库中没有这个代码，请先添加型号";showView("products");$("#pUpc").value=upc;return}phones.unshift({...product,customer,tracking,imei,status:STATUS.IN_STOCK,receivedAt:new Date().toISOString()});if(await save()){["tracking","imei","upc"].forEach(id=>$("#"+id).value="");message.textContent=`✅ 已写入 Excel：${customer} · ${product.model} · ${product.color} · ${product.capacity}`;$("#tracking").focus()}}
async function shipPhone(imei){if(!requireDataFile()||!confirm("确认将这部手机标记为已出库？"))return;phones=phones.map(p=>p.imei===imei?{...p,status:STATUS.SHIPPED,shippedAt:new Date().toISOString()}:p);await save()}
async function submitAdjustment(e){e.preventDefault();if(!requireDataFile())return;const item={id:`adj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,customer:$("#adjustCustomer").value,model:$("#adjustModel").value, color:$("#adjustColor").value,capacity:$("#adjustCapacity").value,type:$("#adjustType").value,quantity:Number($("#adjustQuantity").value),note:$("#adjustNote").value.trim(),createdAt:new Date().toISOString()};if(!item.customer||!item.model||!item.color||!item.capacity){$("#adjustMessage").textContent="请完整选择客户、型号、颜色和容量。";return}if(!Number.isInteger(item.quantity)||item.quantity<1)return;if(item.type==="decrease"&&quantityFor(item)<item.quantity){$("#adjustMessage").textContent=`不能减少 ${item.quantity} 台；该客户此配置当前只有 ${quantityFor(item)} 台。`;return}adjustments.unshift(item);if(await save()){e.currentTarget.reset();$("#adjustMessage").textContent="✅ 已写入 Excel，并同步到客户库存总表。"}}
async function reverseAdjustment(id){if(!requireDataFile())return;const source=adjustments.find(a=>a.id===id);if(!source)return;const reverseType=source.type==="decrease"?"increase":"decrease";const reverse={...source,id:`adj_${Date.now()}_reverse`,type:reverseType,note:`反向修正：${source.note||source.id}`,createdAt:new Date().toISOString()};if(reverseType==="decrease"&&quantityFor(reverse)<reverse.quantity){alert("当前库存不足，无法进行这笔反向修正。");return}if(confirm("系统会新增一笔相反的调整记录，原记录会保留。确认继续？")){adjustments.unshift(reverse);await save()}}
async function submitProduct(e){e.preventDefault();if(!requireDataFile())return;const p={upc:$("#pUpc").value.trim(),model:$("#pModel").value.trim(),color:$("#pColor").value.trim(),capacity:$("#pCapacity").value.trim()};products=[p,...products.filter(x=>x.upc!==p.upc)];if(await save())e.currentTarget.reset()}
function importCsv(e){if(!requireDataFile()){e.target.value="";return}const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{const list=String(reader.result).replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean).slice(1).map(line=>{const [upc,model,color,capacity]=line.split(",").map(v=>v.replace(/^"|"$/g,"").trim());return{upc,model,color,capacity}}).filter(x=>x.upc&&x.model);const codes=new Set(list.map(x=>x.upc));products=[...list,...products.filter(x=>!codes.has(x.upc))];e.target.value="";await save()};reader.readAsText(file)}

function exportAll(){const rows=[["快递单号","IMEI","型号","颜色","容量","客户","状态","入库时间","出库时间"],...phones.map(p=>[String(p.tracking||""),String(p.imei||""),p.model,p.color,p.capacity,p.customer,p.status,formatDate(p.receivedAt),formatDate(p.shippedAt)])];writeXlsx(rows,"逐台记录",`手机逐台记录_${dateKey()}.xlsx`)}
function selectedCustomer(){const c=$("#stockCustomerFilter").value;if(c==="ALL"){alert("请先在“查看客户”中选择一个客户。");return null}return c}
function exportToday(){const c=selectedCustomer();if(!c)return;const list=scannedToday(c);if(!list.length){alert(`${c} 今天还没有扫码入库记录。`);return}const rows=[["客户","快递单号","IMEI","型号","颜色","容量"],...list.map(p=>[p.customer,String(p.tracking||""),String(p.imei||""),p.model,p.color,p.capacity])];writeXlsx(rows,"今日入库明细",`${c}_今日入库明细_${dateKey()}.xlsx`)}
function exportStock(){const c=selectedCustomer();if(!c)return;const list=currentStock().filter(x=>x.customer===c);if(!list.length){alert(`${c} 当前没有库存。`);return}const exportedAt=formatDate(new Date());const rows=[["客户","型号","颜色","容量","当前数量","导出时间"],...list.map(x=>[x.customer,x.model,x.color,x.capacity,x.quantity,exportedAt])];writeXlsx(rows,"当前库存",`${c}_当前库存_${dateKey()}.xlsx`)}

function showView(id){$$('.view').forEach(v=>v.classList.toggle("active",v.id===id));$$('nav button').forEach(b=>b.classList.toggle("active",b.dataset.view===id));const content=VIEW_CONTENT[id];$("#title").textContent=content[0];$("#subtitle").textContent=content[1]}
function fillCustomers(){const options=CUSTOMERS.map(c=>`<option value="${c}">${c}</option>`).join("");$("#receiveCustomer").insertAdjacentHTML("beforeend",options);$("#adjustCustomer").insertAdjacentHTML("beforeend",options);$("#stockCustomerFilter").insertAdjacentHTML("beforeend",options);$("#stockCustomerFilter").insertAdjacentHTML("beforeend",'<option value="未分配">未分配（旧数据）</option>')}
function bind(){$$('nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));$("#tracking").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();$("#imei").focus()}};$("#imei").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();$("#upc").focus()}};$("#upc").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();receivePhone()}};$("#receiveBtn").onclick=receivePhone;$("#adjustmentForm").onsubmit=submitAdjustment;$("#adjustModel").onchange=refreshAdjustmentColors;$("#adjustColor").onchange=refreshAdjustmentCapacities;$("#productForm").onsubmit=submitProduct;$("#csvImport").onchange=importCsv;$("#stockSearch").oninput=renderPhoneTables;$("#shipSearch").oninput=renderPhoneTables;$("#stockCustomerFilter").onchange=()=>renderCustomerStock(currentStock());$("#exportAll").onclick=exportAll;$("#exportCustomerToday").onclick=exportToday;$("#exportCustomerStock").onclick=exportStock;$("#createDataFile").onclick=createDataFile;$("#openDataFile").onclick=openDataFile;$("#receiveCustomer").onchange=()=>{$("#message").textContent=$("#receiveCustomer").value?"请扫描快递单号":"请先选择客户"}}
function init(){fillCustomers();bind();render();$("#receiveCustomer").focus()}
init();
