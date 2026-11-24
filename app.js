"use strict";

const STATUS = { IN_STOCK: "库存中", SHIPPED: "已出库" };
const DEFAULT_PRODUCTS = [
  {upc:"195950685784",model:"iPhone 16 Pro Max",color:"沙漠金色",capacity:"256GB"},
  {upc:"195950385417",model:"iPhone 16 Pro",color:"原色钛金属",capacity:"256GB"},
  {upc:"195950637151",model:"iPhone 17 Pro Max",color:"银色",capacity:"256GB"},
  {upc:"195950626162",model:"iPhone 17 Pro",color:"银色",capacity:"256GB"},
  {upc:"195950638035",model:"iPhone 17 Pro Max",color:"橙色",capacity:"512GB"},
  {upc:"195950638028",model:"iPhone 17 Pro Max",color:"银色",capacity:"512GB"},
  {upc:"195950638011",model:"iPhone 17 Pro Max",color:"蓝色",capacity:"256GB"},
  {upc:"195950638004",model:"iPhone 17 Pro Max",color:"橙色",capacity:"256GB"}
];
const VIEW_CONTENT = {
  receive:["入库扫码","入库码、箱号和经手人选填并保持；IMEI 与 UPC 连续循环扫描"],
  batches:["今日入库批次","实时查看今天每个入库码包含的手机配置、数量和 IMEI"],
  inventory:["库存与历史","按客户、日期或记录类型查看库存与完整出入库历史"],
  adjust:["期初 / 调整库存","录入旧库存或手动增加、减少数量"],
  ship:["出库管理","出库码选填；填写后可连续关联多台 IMEI"],
  products:["UPC 型号库","维护 UPC 与手机型号的对应关系"],
  data:["数据与客户","合并其他设备的数据并导出备份或每日台账"]
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let customers = [];
let products = [];
let phones = [];
let adjustments = [];
let saveBusy = false;
let lastEditableControl = null;
let productColorsCustomized = false;
let displayedInventoryRows = [];
let inventoryCalendarMonth = new Date(new Date().getFullYear(),new Date().getMonth(),1);

async function refocusInput(selector) {
  try { await window.inventoryDesktop.refocus(); } catch {}
  const focus = () => {
    const previous=lastEditableControl;
    const element=selector?$(selector):(previous?.isConnected?previous:(previous?.id?document.getElementById(previous.id):null));
    if(element&&!element.disabled){element.focus({preventScroll:true});}
  };
  requestAnimationFrame(()=>{focus();setTimeout(focus,80);});
}

function installDialogFocusRecovery(){
  const originalAlert=window.alert.bind(window);
  const originalConfirm=window.confirm.bind(window);
  window.alert=message=>{originalAlert(message);void refocusInput();};
  window.confirm=message=>{const answer=originalConfirm(message);void refocusInput();return answer;};
}

function escapeHtml(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function formatDate(value) { return value ? new Intl.DateTimeFormat("zh-CN", {year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(value)) : ""; }
function dateKey(value = new Date()) { const d = new Date(value); const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
function uniqueSorted(values) { return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-CN",{numeric:true})); }
function productKey(item) { return [item.customer,item.model,item.color,item.capacity].join("\u001f"); }
function compareStock(a,b) { return a.customer.localeCompare(b.customer,"zh-CN")||a.model.localeCompare(b.model,"zh-CN")||a.capacity.localeCompare(b.capacity,"zh-CN")||a.color.localeCompare(b.color,"zh-CN"); }
function inboundCode(item) { return String(item?.inboundCode ?? item?.tracking ?? "").trim(); }
function boxNumber(item) { return String(item?.boxNumber ?? item?.boxNo ?? "").trim(); }
function outboundCode(item) { return String(item?.outboundCode ?? item?.shipCode ?? "").trim(); }
function handledBy(item) { return String(item?.handledBy ?? item?.operator ?? "").trim(); }
function normalizePhoneCodes(item) { const normalized={...item,inboundCode:inboundCode(item),boxNumber:boxNumber(item),outboundCode:outboundCode(item),handledBy:handledBy(item)};delete normalized.tracking;delete normalized.boxNo;delete normalized.shipCode;delete normalized.operator;return normalized; }
function allData() { return {version:2,customers,products,phones,adjustments}; }
function validHex(value) { return /^#[0-9a-f]{6}$/i.test(String(value||"")); }
function automaticProductColors(color) {
  const value=String(color||"").trim().toLowerCase();
  const palettes=[
    [["黑","black","午夜","midnight","深空","space black","graphite","石墨"],"#263142","#ffffff"],
    [["白","white","银","silver","星光","starlight","云白","cloud white"],"#edf1f5","#17223b"],
    [["蓝","blue","ultramarine","群青"],"#dbeafe","#173f73"],
    [["橙","orange"],"#ffead2","#78350f"],
    [["灰","gray","grey","钛","titanium","原色","natural"],"#e5e7eb","#374151"],
    [["金","gold","沙漠","desert"],"#f7edcf","#654b12"],
    [["紫","purple","lavender","薰衣草"],"#eee7ff","#4c2885"],
    [["绿","green","sage","鼠尾草","teal","青色"],"#dcf5e5","#14532d"],
    [["粉","pink"],"#fce7f3","#831843"],
    [["红","red"],"#fee2e2","#7f1d1d"],
    [["黄","yellow"],"#fff5bf","#6b4f00"]
  ];
  const found=palettes.find(([names])=>names.some(name=>value.includes(name)));
  return found?{labelBg:found[1],labelText:found[2]}:{labelBg:"#e7efff",labelText:"#17315f"};
}
function productStyle(item) {
  const product=products.find(row=>item.upc&&row.upc===item.upc)||products.find(row=>row.model===item.model&&row.color===item.color&&row.capacity===item.capacity);
  const automatic=automaticProductColors(item.color);
  return {labelBg:validHex(product?.labelBg)?product.labelBg:automatic.labelBg,labelText:validHex(product?.labelText)?product.labelText:automatic.labelText};
}
function phoneBadge(item) {
  const style=productStyle(item);
  return `<span class="phone-badge" style="--phone-bg:${style.labelBg};--phone-text:${style.labelText}"><b>${escapeHtml(item.model)}</b><span>${escapeHtml(item.color)} · ${escapeHtml(item.capacity)}</span></span>`;
}
function updateProductColorPreview() {
  const background=validHex($("#pLabelBg").value)?$("#pLabelBg").value:"#e7efff";
  const textColor=validHex($("#pLabelText").value)?$("#pLabelText").value:"#17315f";
  const label=[$("#pModel").value.trim()||"手机型号",$("#pColor").value.trim()||"颜色",$("#pCapacity").value.trim()||"容量"].join(" · ");
  const preview=$("#productColorPreview");
  preview.style.setProperty("--phone-bg",background);preview.style.setProperty("--phone-text",textColor);preview.textContent=label;
}
function applyAutomaticProductColors() {
  const style=automaticProductColors($("#pColor").value);
  $("#pLabelBg").value=style.labelBg;$("#pLabelText").value=style.labelText;productColorsCustomized=false;updateProductColorPreview();
}
function clearImeiError() {
  $("#imei").classList.remove("input-error");
  $("#message").classList.remove("scan-error-message");
}
function showImeiError(html) {
  const input=$("#imei"),message=$("#message");
  input.classList.add("input-error");message.classList.add("scan-error-message");message.innerHTML=html;
  requestAnimationFrame(()=>{input.focus();input.select();});
}
function showDuplicateImei(phone) {
  const shipped=phone.status===STATUS.SHIPPED&&phone.shippedAt?`｜出库时间：${escapeHtml(formatDate(phone.shippedAt))}`:"";
  showImeiError(`<strong>⚠️ IMEI 重复，已停止入库</strong><br>IMEI：${escapeHtml(phone.imei)}<br>原记录：${escapeHtml(phone.customer)}｜${escapeHtml(phone.model)}｜${escapeHtml(phone.color)}｜${escapeHtml(phone.capacity)}<br>状态：${escapeHtml(phone.status)}｜入库时间：${escapeHtml(formatDate(phone.receivedAt))}${shipped}`);
}
function validateImeiBeforeUpc() {
  const imei=$("#imei").value.trim();
  if(!imei){showImeiError("<strong>⚠️ 请扫描手机 IMEI</strong>");return false;}
  const duplicate=phones.find(phone=>String(phone.imei)===imei);
  if(duplicate){showDuplicateImei(duplicate);return false;}
  clearImeiError();$("#message").textContent="✅ IMEI 未重复，请继续扫描 UPC";$("#upc").focus();return true;
}

function setSaveState(text,kind="ok") {
  const element=$("#saveState");
  element.textContent=text;
  element.classList.toggle("save-error",kind==="error");
  element.classList.toggle("save-busy",kind==="busy");
}

async function save() {
  if (saveBusy) return false;
  saveBusy = true;
  setSaveState("● 正在保存…","busy");
  try {
    const result = await window.inventoryDesktop.save(allData());
    setSaveState("● 已自动保存");
    return true;
  } catch (error) {
    console.error(error);
    setSaveState("⚠ 保存失败","error");
    alert("本次操作没有成功保存。请把整个软件文件夹放到桌面或文档目录后重试。");
    return false;
  } finally { saveBusy = false; }
}

function currentStock() {
  const map = new Map();
  const add = (item, delta) => {
    const key = productKey(item);
    if (!map.has(key)) map.set(key,{customer:item.customer,model:item.model,color:item.color,capacity:item.capacity,quantity:0});
    map.get(key).quantity += delta;
  };
  phones.forEach(phone => { if (phone.status === STATUS.IN_STOCK) add(phone,1); });
  adjustments.forEach(item => add(item,item.type === "decrease" ? -item.quantity : item.quantity));
  return [...map.values()].filter(item => item.quantity !== 0).sort(compareStock);
}
function quantityFor(item) { return currentStock().find(row => productKey(row) === productKey(item))?.quantity || 0; }
function scannedToday(customer) { return phones.filter(phone => phone.customer === customer && dateKey(phone.receivedAt) === dateKey()); }
function shippedToday(customer) { return phones.filter(phone => phone.customer === customer && phone.status === STATUS.SHIPPED && dateKey(phone.shippedAt) === dateKey()); }
function searchText(phone) { return [phone.customer,handledBy(phone),inboundCode(phone),boxNumber(phone),outboundCode(phone),phone.imei,phone.upc,phone.model,phone.color,phone.capacity,phone.status,formatDate(phone.receivedAt),formatDate(phone.shippedAt)].join(" ").toLowerCase(); }
function batchConfigurationSummary(list) {
  const grouped=new Map();
  for(const phone of list){
    const model=phone.model||"未识别型号",color=phone.color||"",capacity=phone.capacity||"";
    const key=[model,color,capacity].join("\u001f");
    if(!grouped.has(key))grouped.set(key,{model,color,capacity,quantity:0});
    grouped.get(key).quantity++;
  }
  return [...grouped.values()].sort((a,b)=>b.quantity-a.quantity||a.model.localeCompare(b.model,"zh-CN",{numeric:true})||a.color.localeCompare(b.color,"zh-CN",{numeric:true})||a.capacity.localeCompare(b.capacity,"zh-CN",{numeric:true}));
}
function todayInboundGroups(customer="",query="") {
  const normalizedQuery=String(query||"").trim().toLowerCase();
  const grouped=new Map();
  phones.filter(phone=>dateKey(phone.receivedAt)===dateKey()&&(!customer||phone.customer===customer)&&(!normalizedQuery||searchText(phone).includes(normalizedQuery))).forEach(phone=>{
    const customerName=phone.customer||"未命名客户",code=inboundCode(phone)||"无入库码";
    const key=`${customerName}\u001f${code}`;
    if(!grouped.has(key))grouped.set(key,{customer:customerName,code,phones:[]});
    grouped.get(key).phones.push(phone);
  });
  return [...grouped.values()].map(group=>({...group,phones:group.phones.sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt))),configurations:batchConfigurationSummary(group.phones),boxes:uniqueSorted(group.phones.map(boxNumber))})).sort((a,b)=>a.customer.localeCompare(b.customer,"zh-CN",{numeric:true})||a.code.localeCompare(b.code,"zh-CN",{numeric:true}));
}
function todayInboundCodes(customer="") {
  return uniqueSorted(phones.filter(phone=>dateKey(phone.receivedAt)===dateKey()&&(!customer||phone.customer===customer)).map(phone=>inboundCode(phone)||"无入库码"));
}
function todayInboundBoxGroups(customer="",code="",query="") {
  const normalizedQuery=String(query||"").trim().toLowerCase();
  const grouped=new Map();
  phones.filter(phone=>{
    const phoneCode=inboundCode(phone)||"无入库码";
    return dateKey(phone.receivedAt)===dateKey()&&(!customer||phone.customer===customer)&&(!code||phoneCode===code)&&(!normalizedQuery||searchText(phone).includes(normalizedQuery));
  }).forEach(phone=>{
    const customerName=phone.customer||"未命名客户",phoneCode=inboundCode(phone)||"无入库码",box=boxNumber(phone)||"无箱号";
    const key=[customerName,phoneCode,box].join("\u001f");
    if(!grouped.has(key))grouped.set(key,{customer:customerName,code:phoneCode,box,phones:[]});
    grouped.get(key).phones.push(phone);
  });
  return [...grouped.values()].map(group=>({...group,phones:group.phones.sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt))),configurations:batchConfigurationSummary(group.phones)})).sort((a,b)=>a.customer.localeCompare(b.customer,"zh-CN",{numeric:true})||a.code.localeCompare(b.code,"zh-CN",{numeric:true})||a.box.localeCompare(b.box,"zh-CN",{numeric:true}));
}

function setSelectOptions(select, values, placeholder, selected = "") {
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (values.includes(selected)) select.value = selected;
  select.disabled = !values.length;
}
function refreshCustomerOptions() {
  const ids = ["#receiveCustomer","#adjustCustomer","#shipCustomerFilter"];
  for (const id of ids) {
    const element = $(id), selected = element.value;
    setSelectOptions(element,customers,"请选择客户",selected);
  }
  const inventory=$("#inventoryCustomerFilter"),inventorySelected=inventory.value;
  inventory.innerHTML='<option value="">全部客户</option>'+customers.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if(customers.includes(inventorySelected))inventory.value=inventorySelected;
  const batch=$("#batchCustomerFilter"),batchSelected=batch.value;
  batch.innerHTML='<option value="">全部客户</option>'+customers.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if(customers.includes(batchSelected))batch.value=batchSelected;
}
function refreshAdjustmentModels() {
  const element=$("#adjustModel"),selected=element.value;
  setSelectOptions(element,uniqueSorted(products.map(item=>item.model)),"请选择型号",selected);
  refreshAdjustmentColors();
}
function refreshAdjustmentColors() {
  const model=$("#adjustModel").value,element=$("#adjustColor"),selected=element.value;
  setSelectOptions(element,uniqueSorted(products.filter(item=>item.model===model).map(item=>item.color)),model?"请选择颜色":"请先选择型号",selected);
  refreshAdjustmentCapacities();
}
function refreshAdjustmentCapacities() {
  const model=$("#adjustModel").value,color=$("#adjustColor").value,element=$("#adjustCapacity"),selected=element.value;
  setSelectOptions(element,uniqueSorted(products.filter(item=>item.model===model&&item.color===color).map(item=>item.capacity)),color?"请选择容量":"请先选择颜色",selected);
}

function renderStats(stock) {
  const element=$("#stats");
  if (!stock.length) { element.innerHTML='<div class="empty">还没有库存数据</div>'; return; }
  const sorted=stock.slice().sort((a,b)=>b.quantity-a.quantity),max=Math.max(...sorted.map(item=>Math.max(item.quantity,0)));
  element.innerHTML=sorted.slice(0,7).map(item=>`<div class="row"><span><b>${escapeHtml(item.customer)}</b> ${phoneBadge(item)}</span><b>${item.quantity}</b></div><div class="bar"><i style="width:${Math.max(8,max?item.quantity/max*100:0)}%"></i></div>`).join("");
}
function renderRecent() {
  const element=$("#recent"),list=phones.slice().sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt))).slice(0,6);
  if (!list.length) { element.innerHTML='<div class="empty">扫码入库后会显示在这里</div>'; return; }
  element.innerHTML=list.map(phone=>`<div class="row"><span><b>${escapeHtml(phone.customer)}</b> ${phoneBadge(phone)}</span><small>${handledBy(phone)?`经手人：${escapeHtml(handledBy(phone))} · `:""}${escapeHtml(String(phone.imei).slice(-6))}</small></div>`).join("");
}
function renderRecentShipments() {
  const list=phones.filter(phone=>phone.status===STATUS.SHIPPED&&dateKey(phone.shippedAt)===dateKey()).sort((a,b)=>String(b.shippedAt).localeCompare(String(a.shippedAt)));
  $("#recentShippedCount").textContent=list.length;
  $("#recentShipTable").innerHTML=list.length?`<table><thead><tr><th>出库时间</th><th>出库码</th><th>客户</th><th>入库经手人</th><th>手机</th><th>IMEI</th><th>入库码</th><th>箱号</th></tr></thead><tbody>${list.map(phone=>`<tr><td>${escapeHtml(formatDate(phone.shippedAt))}</td><td><b>${escapeHtml(outboundCode(phone))}</b></td><td><b>${escapeHtml(phone.customer)}</b></td><td>${escapeHtml(handledBy(phone))}</td><td>${phoneBadge(phone)}</td><td>${escapeHtml(phone.imei)}</td><td>${escapeHtml(inboundCode(phone))}</td><td>${escapeHtml(boxNumber(phone))}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">今天还没有扫码出库记录</div>';
}
function renderTodayBatches() {
  const customer=$("#batchCustomerFilter").value,query=$("#batchSearch").value;
  const codeSelect=$("#batchInboundFilter"),previousCode=codeSelect.value,codes=todayInboundCodes(customer);
  codeSelect.innerHTML=codes.length?codes.map(code=>`<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`).join(""):'<option value="">今天还没有入库码</option>';
  codeSelect.disabled=!codes.length;
  const selectedCode=codes.includes(previousCode)?previousCode:(codes[0]||"");
  codeSelect.value=selectedCode;
  const overviewGroups=selectedCode?todayInboundBoxGroups(customer,selectedCode,""):[];
  const overviewPhones=overviewGroups.flatMap(group=>group.phones);
  const groups=selectedCode?todayInboundBoxGroups(customer,selectedCode,query):[];
  $("#batchTodayDate").textContent=dateKey();
  $("#batchGroupCount").textContent=overviewGroups.length;
  $("#batchPhoneCount").textContent=overviewPhones.length;
  $("#batchConfigCount").textContent=new Set(overviewPhones.map(phone=>[phone.model,phone.color,phone.capacity].join("\u001f"))).size;
  if(overviewPhones.length){
    const overviewConfigurations=batchConfigurationSummary(overviewPhones);
    const overviewCustomers=uniqueSorted(overviewPhones.map(phone=>phone.customer||"未命名客户"));
    const overviewBoxes=uniqueSorted(overviewGroups.map(group=>group.box));
    const customerTags=overviewCustomers.map(value=>`<span class="batch-customer">${escapeHtml(value)}</span>`).join("");
    const boxTags=overviewBoxes.map(value=>`<span class="batch-box-tag">${escapeHtml(value)}</span>`).join("");
    const configurationRows=overviewConfigurations.map(item=>`<tr><td>${phoneBadge(item)}</td><td><b>${item.quantity}</b></td></tr>`).join("");
    const overviewHandlers=uniqueSorted(overviewPhones.map(handledBy));
    const handlerTags=(overviewHandlers.length?overviewHandlers:["未填写"]).map(value=>`<span class="batch-box-tag">${escapeHtml(value)}</span>`).join("");
    const imeiRows=overviewPhones.slice().sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt))).map(phone=>`<tr><td>${escapeHtml(formatDate(phone.receivedAt))}</td><td>${escapeHtml(phone.customer||"未命名客户")}</td><td>${escapeHtml(handledBy(phone))}</td><td>${escapeHtml(boxNumber(phone)||"无箱号")}</td><td>${phoneBadge(phone)}</td><td>${escapeHtml(phone.imei)}</td></tr>`).join("");
    $("#batchOverviewCard").innerHTML=`<article class="card batch-overview-card">
      <div class="batch-card-header"><div><span class="batch-overview-label">入库码总览</span><h3>${escapeHtml(selectedCode)}</h3></div><strong>${overviewPhones.length}<small> 部手机</small></strong></div>
      <div class="batch-overview-meta"><div><b>客户</b><span>${customerTags}</span></div><div><b>经手人</b><span>${handlerTags}</span></div><div><b>箱号（${overviewGroups.length} 个卡片）</b><span>${boxTags}</span></div></div>
      <div class="batch-summary-table batch-overview-summary"><table><thead><tr><th>全部手机配置</th><th>数量</th></tr></thead><tbody>${configurationRows}</tbody></table></div>
      <details class="batch-imei-details"><summary>查看这个入库码的全部 ${overviewPhones.length} 个 IMEI</summary><div class="table record-table batch-overview-imei-table" data-max-rows="12"><table><thead><tr><th>入库时间</th><th>客户</th><th>经手人</th><th>箱号</th><th>手机</th><th>IMEI</th></tr></thead><tbody>${imeiRows}</tbody></table></div></details>
    </article>`;
  }else $("#batchOverviewCard").innerHTML="";
  $("#batchCards").innerHTML=groups.length?groups.map((group,index)=>{
    const configurationRows=group.configurations.map(item=>`<tr><td>${phoneBadge(item)}</td><td><b>${item.quantity}</b></td></tr>`).join("");
    const groupHandlers=uniqueSorted(group.phones.map(handledBy));
    const handlerText=groupHandlers.length?groupHandlers.join("、"):"未填写";
    const imeiRows=group.phones.map(phone=>`<tr><td>${escapeHtml(formatDate(phone.receivedAt))}</td><td>${escapeHtml(handledBy(phone))}</td><td>${phoneBadge(phone)}</td><td>${escapeHtml(phone.imei)}</td></tr>`).join("");
    return `<article class="card batch-card">
      <div class="batch-card-header"><div><span class="batch-customer">${escapeHtml(group.customer)}</span><span class="batch-code-tag">入库码：${escapeHtml(group.code)}</span><h3>箱号：${escapeHtml(group.box)}</h3><small class="muted">经手人：${escapeHtml(handlerText)}</small></div><strong>${group.phones.length}<small> 部手机</small></strong></div>
      <div class="batch-summary-table"><table><thead><tr><th>手机配置</th><th>数量</th></tr></thead><tbody>${configurationRows}</tbody></table></div>
      <details class="batch-imei-details" ${groups.length===1&&index===0?"open":""}><summary>查看全部 ${group.phones.length} 个 IMEI</summary><div class="table record-table batch-imei-table" data-max-rows="9"><table><thead><tr><th>入库时间</th><th>经手人</th><th>手机</th><th>IMEI</th></tr></thead><tbody>${imeiRows}</tbody></table></div></details>
    </article>`;
  }).join(""):`<div class="card empty">${codes.length?"这个入库码下没有符合搜索条件的记录":"今天还没有符合条件的扫码入库记录"}</div>`;
  $$(".batch-imei-details").forEach(details=>details.ontoggle=()=>requestAnimationFrame(resizeDynamicTables));
  requestAnimationFrame(resizeDynamicTables);
}
function phoneTable(items) {
  if (!items.length) return '<div class="empty">没有符合条件的记录</div>';
  return `<table><thead><tr><th>客户</th><th>经手人</th><th>手机</th><th>IMEI</th><th>入库码</th><th>箱号</th><th>出库码</th><th>状态</th><th>入库时间</th><th>出库时间</th></tr></thead><tbody>${items.map(phone=>`<tr><td><b>${escapeHtml(phone.customer)}</b></td><td>${escapeHtml(handledBy(phone))}</td><td>${phoneBadge(phone)}</td><td>${escapeHtml(phone.imei)}</td><td>${escapeHtml(inboundCode(phone))}</td><td>${escapeHtml(boxNumber(phone))}</td><td>${escapeHtml(outboundCode(phone))}</td><td><span class="tag ${phone.status===STATUS.SHIPPED?"shipped":""}">${escapeHtml(phone.status)}</span></td><td>${escapeHtml(formatDate(phone.receivedAt))}</td><td>${phone.status===STATUS.SHIPPED?escapeHtml(formatDate(phone.shippedAt)):'<span class="muted">—</span>'}</td></tr>`).join("")}</tbody></table>`;
}
function renderHistorySummary(list) {
  const shipped=list.filter(phone=>phone.status===STATUS.SHIPPED).length;
  const inStock=list.filter(phone=>phone.status===STATUS.IN_STOCK).length;
  const models=new Set(list.map(phone=>String(phone.model||"").trim()).filter(Boolean));
  const configurationKey=phone=>[phone.model,phone.color,phone.capacity].join("\u001f");
  const configurations=new Set(list.map(configurationKey));
  $("#historyReceivedCount").textContent=list.length;$("#historyShippedCount").textContent=shipped;$("#historyInStockCount").textContent=inStock;$("#historyModelCount").textContent=models.size;$("#historyConfigCount").textContent=configurations.size;
  const grouped=new Map();
  for(const phone of list){
    const key=configurationKey(phone);
    if(!grouped.has(key))grouped.set(key,{model:phone.model,color:phone.color,capacity:phone.capacity,received:0,shipped:0,inStock:0});
    const row=grouped.get(key);row.received++;if(phone.status===STATUS.SHIPPED)row.shipped++;else if(phone.status===STATUS.IN_STOCK)row.inStock++;
  }
  const rows=[...grouped.values()].sort((a,b)=>b.received-a.received||a.model.localeCompare(b.model,"zh-CN")||a.capacity.localeCompare(b.capacity,"zh-CN")||a.color.localeCompare(b.color,"zh-CN"));
  $("#historyTypeTable").innerHTML=rows.length?`<table><thead><tr><th>手机配置</th><th>历史扫码入库</th><th>历史扫码出库</th><th>当前扫码在库</th></tr></thead><tbody>${rows.map(item=>`<tr><td>${phoneBadge(item)}</td><td><b>${item.received}</b></td><td>${item.shipped}</td><td>${item.inStock}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">还没有扫码手机历史记录</div>';
}

function inventorySearchText(item) {
  return [item.type,item.customer,handledBy(item),inboundCode(item),boxNumber(item),outboundCode(item),item.imei,item.model,item.color,item.capacity,item.status,item.note,item.quantity,formatDate(item.timestamp||item.receivedAt),formatDate(item.shippedAt)].join(" ").toLowerCase();
}
function dailyActivity(customer,date) {
  const events=[];
  for(const phone of phones){
    if((!customer||phone.customer===customer)&&dateKey(phone.receivedAt)===date)events.push({type:"扫码入库",timestamp:phone.receivedAt,customer:phone.customer,handledBy:handledBy(phone),inboundCode:inboundCode(phone),boxNumber:boxNumber(phone),outboundCode:"",imei:phone.imei,model:phone.model,color:phone.color,capacity:phone.capacity,quantity:1,note:"",delta:1,phone});
    if((!customer||phone.customer===customer)&&phone.status===STATUS.SHIPPED&&dateKey(phone.shippedAt)===date)events.push({type:"扫码出库",timestamp:phone.shippedAt,customer:phone.customer,handledBy:handledBy(phone),inboundCode:inboundCode(phone),boxNumber:boxNumber(phone),outboundCode:outboundCode(phone),imei:phone.imei,model:phone.model,color:phone.color,capacity:phone.capacity,quantity:1,note:"",delta:-1,phone});
  }
  const labels={initial:"期初库存",increase:"手动增加",decrease:"手动减少"};
  for(const item of adjustments){
    if((!customer||item.customer===customer)&&dateKey(item.createdAt)===date){
      const quantity=Number(item.quantity)||0;
      events.push({...item,type:labels[item.type]||item.type,timestamp:item.createdAt,handledBy:"",inboundCode:"",boxNumber:"",outboundCode:"",imei:"",quantity,delta:item.type==="decrease"?-quantity:quantity});
    }
  }
  return events.sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
}
function inboundDatesFor(customer) {
  return new Set(phones.filter(phone=>phone.receivedAt&&(!customer||phone.customer===customer)).map(phone=>dateKey(phone.receivedAt)));
}
function setCalendarMonthFromDate(value) {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
  if(match)inventoryCalendarMonth=new Date(Number(match[1]),Number(match[2])-1,1);
}
function renderInventoryCalendar() {
  const selected=$("#inventoryDate").value||dateKey();
  $("#inventoryDateButtonText").textContent=selected;
  const year=inventoryCalendarMonth.getFullYear(),month=inventoryCalendarMonth.getMonth();
  $("#inventoryCalendarMonth").textContent=`${year}年${month+1}月`;
  const customer=$("#inventoryCustomerFilter").value;
  const inboundDates=inboundDatesFor(customer);
  const today=dateKey(),firstDay=new Date(year,month,1).getDay(),daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let index=0;index<firstDay;index++)cells.push('<span class="calendar-empty"></span>');
  for(let day=1;day<=daysInMonth;day++){
    const value=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const classes=["calendar-day",value===selected?"selected":"",value===today?"today":"",inboundDates.has(value)?"has-inbound":""].filter(Boolean).join(" ");
    cells.push(`<button type="button" class="${classes}" data-calendar-date="${value}" aria-label="${value}${inboundDates.has(value)?"，有扫码入库":""}"><span>${day}</span></button>`);
  }
  $("#inventoryCalendarDays").innerHTML=cells.join("");
  $$('[data-calendar-date]').forEach(button=>button.onclick=()=>{
    $("#inventoryDate").value=button.dataset.calendarDate;
    $("#inventoryCalendar").hidden=true;$("#inventoryDateButton").setAttribute("aria-expanded","false");
    renderInventory();
  });
}
function toggleInventoryCalendar() {
  const calendar=$("#inventoryCalendar"),opening=calendar.hidden;
  if(opening)setCalendarMonthFromDate($("#inventoryDate").value||dateKey());
  calendar.hidden=!opening;$("#inventoryDateButton").setAttribute("aria-expanded",String(opening));
  if(opening)renderInventoryCalendar();
}
function renderInventory() {
  const mode=$("#inventoryMode").value,customer=$("#inventoryCustomerFilter").value,query=$("#inventorySearch").value.trim().toLowerCase();
  const date=mode==="today"?dateKey():($("#inventoryDate").value||dateKey());
  $("#inventoryDateWrap").hidden=mode!=="date";
  $("#inventoryDailyOverview").hidden=!(mode==="today"||mode==="date");
  $("#inventoryHistoryOverview").hidden=mode!=="history";
  $("#inventoryTypeCard").hidden=mode!=="history";
  renderInventoryCalendar();
  const table=$("#inventoryTable"),title=$("#inventoryTableTitle"),help=$("#inventoryTableHelp");

  if(mode==="current"){
    title.textContent="当前库存汇总";help.textContent="包含扫码在库手机，以及期初库存和手动调整后的数量。";
    displayedInventoryRows=currentStock().filter(item=>(!customer||item.customer===customer)&&inventorySearchText(item).includes(query));
    table.innerHTML=displayedInventoryRows.length?`<table><thead><tr><th>客户</th><th>手机</th><th>当前数量</th></tr></thead><tbody>${displayedInventoryRows.map(item=>`<tr><td><b>${escapeHtml(item.customer)}</b></td><td>${phoneBadge(item)}</td><td><b>${item.quantity}</b></td></tr>`).join("")}</tbody></table>`:'<div class="empty">当前筛选条件下没有库存</div>';
  }else if(mode==="today"||mode==="date"){
    const allEvents=dailyActivity(customer,date);
    displayedInventoryRows=allEvents.filter(item=>inventorySearchText(item).includes(query));
    title.textContent=`${date} 出入库记录`;help.textContent="同时显示扫码入库、扫码出库、期初库存和手动增减记录。";$("#inventoryDailyTitle").textContent=`${date} 出入库统计`;
    const count=type=>displayedInventoryRows.filter(item=>item.type===type).reduce((sum,item)=>sum+item.quantity,0);
    const received=count("扫码入库"),shipped=count("扫码出库"),added=count("期初库存")+count("手动增加"),reduced=count("手动减少"),net=displayedInventoryRows.reduce((sum,item)=>sum+item.delta,0);
    $("#dailyReceivedCount").textContent=received;$("#dailyShippedCount").textContent=shipped;$("#dailyAddedCount").textContent=added;$("#dailyReducedCount").textContent=reduced;$("#dailyNetCount").textContent=net>0?`+${net}`:net;
    table.innerHTML=displayedInventoryRows.length?`<table><thead><tr><th>操作</th><th>时间</th><th>客户</th><th>经手人</th><th>手机</th><th>入库码</th><th>箱号</th><th>出库码</th><th>IMEI</th><th>数量</th><th>备注</th></tr></thead><tbody>${displayedInventoryRows.map(item=>`<tr><td><span class="tag ${item.type.includes("出库")||item.type.includes("减少")?"shipped":""}">${escapeHtml(item.type)}</span></td><td>${escapeHtml(formatDate(item.timestamp))}</td><td><b>${escapeHtml(item.customer)}</b></td><td>${escapeHtml(handledBy(item))}</td><td>${phoneBadge(item)}</td><td>${escapeHtml(inboundCode(item))}</td><td>${escapeHtml(boxNumber(item))}</td><td>${escapeHtml(outboundCode(item))}</td><td>${escapeHtml(item.imei||"")}</td><td>${item.delta<0?"−":"+"}${item.quantity}</td><td>${escapeHtml(item.note||"")}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">所选日期没有符合条件的出入库记录</div>';
  }else{
    title.textContent="全部逐台历史";help.textContent="同时显示当前在库和已出库手机；手机出库后记录不会删除。";
    const customerPhones=phones.filter(phone=>!customer||phone.customer===customer);
    displayedInventoryRows=customerPhones.filter(phone=>searchText(phone).includes(query));
    renderHistorySummary(customerPhones);
    table.innerHTML=phoneTable(displayedInventoryRows);
  }
  requestAnimationFrame(resizeDynamicTables);
}
function resizeDynamicTables(){
  $$(".view.active .record-table").forEach(element=>{
    const available=window.innerHeight-element.getBoundingClientRect().top-42;
    const maximumRows=Math.max(4,Number(element.dataset.maxRows)||16);
    const visibleRows=Math.max(4,Math.min(maximumRows,Math.floor((available-46)/58)));
    const contentRows=element.querySelectorAll("tbody tr").length;
    const rows=contentRows?Math.min(contentRows,visibleRows):visibleRows;
    element.style.maxHeight=`${Math.max(220,Math.min(46+rows*58,available))}px`;
    element.dataset.visibleRows=String(visibleRows);
  });
}
function renderAdjustments() {
  if (!adjustments.length) { $("#adjustmentTable").innerHTML='<div class="empty">还没有调整记录</div>'; return; }
  const labels={initial:"期初库存",increase:"增加库存",decrease:"减少库存"};
  $("#adjustmentTable").innerHTML=`<table><thead><tr><th>时间</th><th>客户</th><th>手机</th><th>操作</th><th>数量</th><th>备注</th><th>修正</th></tr></thead><tbody>${adjustments.map(item=>`<tr><td>${escapeHtml(formatDate(item.createdAt))}</td><td><b>${escapeHtml(item.customer)}</b></td><td>${phoneBadge(item)}</td><td>${labels[item.type]||escapeHtml(item.type)}</td><td>${item.type==="decrease"?"−":"+"}${item.quantity}</td><td>${escapeHtml(item.note||"")}</td><td><button class="delete" data-reverse="${escapeHtml(item.id)}">反向修正</button></td></tr>`).join("")}</tbody></table>`;
  $$('[data-reverse]').forEach(button=>button.onclick=()=>reverseAdjustment(button.dataset.reverse));
}
function renderProducts() {
  const rows=products.map(item=>`<tr><td>${escapeHtml(item.upc)}</td><td>${phoneBadge(item)}</td><td><span class="color-code">${escapeHtml(productStyle(item).labelBg)} / ${escapeHtml(productStyle(item).labelText)}</span></td><td><button class="secondary product-edit" data-edit-upc="${escapeHtml(item.upc)}">编辑</button> <button class="delete" data-delete-upc="${escapeHtml(item.upc)}">删除</button></td></tr>`).join("");
  $("#productTable").innerHTML=products.length?`<table><thead><tr><th>UPC</th><th>显示效果</th><th>背景 / 文字</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">还没有 UPC 型号</div>';
  $$('[data-edit-upc]').forEach(button=>button.onclick=()=>editProduct(button.dataset.editUpc));
  $$('[data-delete-upc]').forEach(button=>button.onclick=async()=>{if(confirm("确认删除这个 UPC 型号？")){const old=products;products=products.filter(item=>item.upc!==button.dataset.deleteUpc);if(!await save())products=old;render();}});
}
function editProduct(upc) {
  const product=products.find(item=>item.upc===upc);if(!product)return;
  $("#pUpc").value=product.upc;$("#pModel").value=product.model;$("#pColor").value=product.color;$("#pCapacity").value=product.capacity;
  const style=productStyle(product);$("#pLabelBg").value=style.labelBg;$("#pLabelText").value=style.labelText;productColorsCustomized=validHex(product.labelBg)||validHex(product.labelText);updateProductColorPreview();$("#pUpc").focus();
}
function renderCustomers() {
  $("#customerList").innerHTML=customers.length?customers.map(customer=>`<span class="chip">${escapeHtml(customer)} <button data-delete-customer="${escapeHtml(customer)}">×</button></span>`).join(""):'<span class="muted">还没有客户，请先添加。</span>';
  $$('[data-delete-customer]').forEach(button=>button.onclick=async()=>{
    const customer=button.dataset.deleteCustomer;
    if(phones.some(item=>item.customer===customer)||adjustments.some(item=>item.customer===customer)){alert("这个客户已有库存或记录，不能删除。");await refocusInput("#newCustomer");return;}
    const confirmed=confirm(`确认删除客户 ${customer}？`);
    if(confirmed){const old=customers;customers=customers.filter(item=>item!==customer);if(!await save())customers=old;render();}
    await refocusInput("#newCustomer");
  });
}
function render() {
  refreshCustomerOptions();
  const stock=currentStock();
  $("#stockCount").textContent=stock.reduce((sum,item)=>sum+item.quantity,0);
  $("#todayCount").textContent=phones.filter(phone=>dateKey(phone.receivedAt)===dateKey()).length;
  $("#shippedCount").textContent=phones.filter(phone=>phone.status===STATUS.SHIPPED).length;
  $("#modelCount").textContent=stock.length;
  renderStats(stock);renderRecent();renderRecentShipments();renderTodayBatches();renderInventory();renderAdjustments();renderProducts();renderCustomers();refreshAdjustmentModels();requestAnimationFrame(resizeDynamicTables);
}

async function receivePhone() {
  const customer=$("#receiveCustomer").value,code=$("#inboundCode").value.trim(),boxNumberValue=$("#boxNumber").value.trim(),handler=$("#handledBy").value.trim(),imei=$("#imei").value.trim(),upc=$("#upc").value.trim(),message=$("#message");
  if(!customer){message.textContent="⚠️ 请先选择客户";$("#imei").focus();return;}
  if(!imei||!upc){message.textContent="⚠️ IMEI 和 UPC 必须扫描；入库码、箱号和经手人可以留空";(!imei?$("#imei"):$("#upc")).focus();return;}
  const duplicateImei=phones.find(phone=>String(phone.imei)===imei);
  if(duplicateImei){showDuplicateImei(duplicateImei);return;}
  const product=products.find(item=>item.upc===upc);
  if(!product){message.textContent="⚠️ UPC 型号库中没有这个代码，请先添加型号";showView("products");$("#pUpc").value=upc;return;}
  const phone={...product,customer,inboundCode:code,boxNumber:boxNumberValue,handledBy:handler,outboundCode:"",imei,status:STATUS.IN_STOCK,receivedAt:new Date().toISOString(),shippedAt:""};
  phones.unshift(phone);
  if(await save()){
    ["imei","upc"].forEach(id=>$("#"+id).value="");
    clearImeiError();
    message.innerHTML=`✅ 入库成功：<b>${escapeHtml(customer)}</b>${handler?`｜经手人：<b>${escapeHtml(handler)}</b>`:""} ${phoneBadge(product)}`;
    $("#imei").focus();render();
  } else phones=phones.filter(item=>item!==phone);
}
async function shipPhone(imei, askConfirm) {
  imei=String(imei||"").trim();const message=$("#shipMessage"),code=$("#outboundCode").value.trim();
  if(!imei){message.textContent="⚠️ 请先扫描 IMEI";return false;}
  const index=phones.findIndex(phone=>String(phone.imei)===imei);
  if(index<0){message.textContent="⚠️ 没有找到这个 IMEI；期初库存没有逐台 IMEI，请在调整库存中手动减少";return false;}
  const phone=phones[index];
  if(phone.status===STATUS.SHIPPED){message.textContent=`⚠️ 这个 IMEI 已经出库：${phone.customer} · ${phone.model} · ${formatDate(phone.shippedAt)}`;return false;}
  if(askConfirm&&!confirm(`确认出库？\n出库码：${code||"（空白）"}\n${phone.customer} · ${phone.model} · ${phone.color} · ${phone.capacity}\nIMEI：${phone.imei}`))return false;
  const previous=phone;
  phones[index]={...phone,outboundCode:code,status:STATUS.SHIPPED,shippedAt:new Date().toISOString()};
  if(await save()){
    message.innerHTML=code?`✅ 出库成功：出库码 <b>${escapeHtml(code)}</b>｜${escapeHtml(phone.customer)} ${phoneBadge(phone)}<br><small>出库码已保留，可继续扫描下一台 IMEI。</small>`:`✅ 出库成功：<b>${escapeHtml(phone.customer)}</b> ${phoneBadge(phone)}<br><small>本台未填写出库码，可继续扫描下一台 IMEI。</small>`;
    $("#shipImei").value="";$("#shipImei").focus();render();return true;
  }
  phones[index]=previous;return false;
}
function shipScannedImei(){return shipPhone($("#shipImei").value,false);}

async function submitAdjustment(event) {
  event.preventDefault();
  const item={id:`adj_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,customer:$("#adjustCustomer").value,model:$("#adjustModel").value,color:$("#adjustColor").value,capacity:$("#adjustCapacity").value,type:$("#adjustType").value,quantity:Number($("#adjustQuantity").value),note:$("#adjustNote").value.trim(),createdAt:new Date().toISOString()};
  if(!item.customer||!item.model||!item.color||!item.capacity){$("#adjustMessage").textContent="请完整选择客户、型号、颜色和容量。";return;}
  if(!Number.isInteger(item.quantity)||item.quantity<1)return;
  if(item.type==="decrease"&&quantityFor(item)<item.quantity){$("#adjustMessage").textContent=`不能减少 ${item.quantity} 台；该客户此配置当前只有 ${quantityFor(item)} 台。`;return;}
  adjustments.unshift(item);
  if(await save()){event.currentTarget.reset();$("#adjustMessage").textContent=item.type==="decrease"?"✅ 已减少库存数量；此操作不会生成逐台 IMEI 出库明细。":"✅ 已加入客户库存。";render();}
  else adjustments=adjustments.filter(row=>row!==item);
}
async function reverseAdjustment(id) {
  const source=adjustments.find(item=>item.id===id);if(!source)return;
  const reverse={...source,id:`adj_${Date.now()}_reverse`,type:source.type==="decrease"?"increase":"decrease",note:`反向修正：${source.note||source.id}`,createdAt:new Date().toISOString()};
  if(reverse.type==="decrease"&&quantityFor(reverse)<reverse.quantity){alert("当前库存不足，无法进行这笔反向修正。");return;}
  if(confirm("系统会新增一笔相反的调整记录，原记录会保留。确认继续？")){adjustments.unshift(reverse);if(!await save())adjustments=adjustments.filter(item=>item!==reverse);render();}
}
async function submitProduct(event) {
  event.preventDefault();
  const product={upc:$("#pUpc").value.trim(),model:$("#pModel").value.trim(),color:$("#pColor").value.trim(),capacity:$("#pCapacity").value.trim(),labelBg:$("#pLabelBg").value,labelText:$("#pLabelText").value};
  const old=products;products=[product,...products.filter(item=>item.upc!==product.upc)];
  if(await save()){event.currentTarget.reset();productColorsCustomized=false;applyAutomaticProductColors();render();}else products=old;
}
function importCsv(event) {
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async()=>{const list=String(reader.result).replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean).slice(1).map(line=>{const [upc,model,color,capacity,labelBg,labelText]=line.split(",").map(value=>value.replace(/^"|"$/g,"").trim());const existing=products.find(item=>item.upc===upc);return{upc,model,color,capacity,labelBg:validHex(labelBg)?labelBg:existing?.labelBg,labelText:validHex(labelText)?labelText:existing?.labelText};}).filter(item=>item.upc&&item.model);const old=products,codes=new Set(list.map(item=>item.upc));products=[...list,...products.filter(item=>!codes.has(item.upc))];event.target.value="";if(!await save())products=old;render();};
  reader.readAsText(file);
}

function detailRows(list) { return [["客户","经手人","入库码","箱号","出库码","IMEI","型号","颜色","容量"],...list.map(phone=>[phone.customer,handledBy(phone),inboundCode(phone),boxNumber(phone),outboundCode(phone),String(phone.imei||""),phone.model,phone.color,phone.capacity])]; }
function truncateSheetName(value,length){return Array.from(value).slice(0,length).join("");}
function uniqueSheetName(value,used){
  let base=String(value||"未命名客户").replace(/[\\\/:*?\[\]]/g,"_").replace(/^'+|'+$/g,"").trim()||"未命名客户";
  if(/^history$/i.test(base))base="History_客户";
  base=truncateSheetName(base,31);
  let name=base,index=2;
  while(used.has(name.toLocaleLowerCase())){
    const suffix=`_${index++}`;
    name=truncateSheetName(base,31-Array.from(suffix).length)+suffix;
  }
  used.add(name.toLocaleLowerCase());
  return name;
}
async function writeWorkbook(sheets,filename) {
  try { const result=await window.inventoryDesktop.exportXlsx({filename,sheets});if(!result.canceled)alert(`导出成功：\n${result.path}`); }
  catch(error){console.error(error);alert("Excel 导出失败，请重新选择保存位置。");}
}
function writeXlsx(rows,sheet,filename){return writeWorkbook([{name:sheet,rows}],filename);}
async function exportInStockDetails(){
  const list=phones.filter(phone=>phone.status===STATUS.IN_STOCK);
  if(!list.length){alert("当前没有扫码入库且仍在库的手机。");return;}
  const used=new Set();
  const sheets=uniqueSorted(list.map(phone=>phone.customer||"未命名客户")).map(customer=>({
    name:uniqueSheetName(customer,used),
    rows:detailRows(list.filter(phone=>(phone.customer||"未命名客户")===customer))
  }));
  await writeWorkbook(sheets,`全部在库手机明细_按客户_${dateKey()}.xlsx`);
}
async function exportDailyLedger(){
  const sheets=window.InventoryData.buildDailyLedger(phones,adjustments);
  if(!sheets.length){alert("当前没有可以导出的出入库或调整记录。");return;}
  $("#exportMenu").removeAttribute("open");
  await writeWorkbook(sheets,`手机库存每日台账_${dateKey()}.xlsx`);
}
async function exportTodayByInboundCode(){
  const today=dateKey();
  const groups=todayInboundGroups();
  if(!groups.length){alert("今天还没有扫码入库记录。");return;}
  const used=new Set();
  const sheets=groups.map(group=>{
    const summary=group.configurations;
    return{
      name:uniqueSheetName(`${group.customer}_${group.code}`,used),
      rows:[["日期",today],["客户",group.customer],["入库码",group.code],["经手人",uniqueSorted(group.phones.map(handledBy)).join("、")],["总台数",group.phones.length],[],["型号","颜色","容量","数量"],...summary.map(item=>[item.model,item.color,item.capacity,item.quantity])]
    };
  });
  $("#exportMenu").removeAttribute("open");
  await writeWorkbook(sheets,`今日入库_按入库码_${today}.xlsx`);
}
async function exportShippedToday(){const customer=$("#shipCustomerFilter").value;if(!customer){alert("请先选择要导出的客户。");return;}const list=shippedToday(customer);if(!list.length){alert(`${customer} 今天还没有扫码出库记录。`);return;}await writeXlsx(detailRows(list),"今日出库明细",`${customer}_今日出库明细_${dateKey()}.xlsx`);}
async function exportInventoryCurrent(){
  const mode=$("#inventoryMode").value,customer=$("#inventoryCustomerFilter").value||"全部客户",query=$("#inventorySearch").value.trim();
  if(!displayedInventoryRows.length){alert("当前显示中没有可以导出的记录。");return;}
  if(mode==="current"){
    const rows=[["客户","型号","颜色","容量","当前数量"],...displayedInventoryRows.map(item=>[item.customer,item.model,item.color,item.capacity,item.quantity])];
    await writeXlsx(rows,"当前库存汇总",`${customer}_当前库存汇总_${dateKey()}.xlsx`);return;
  }
  if(mode==="history"){
    const rows=[["客户","经手人","入库码","箱号","出库码","IMEI","型号","颜色","容量","状态","入库时间","出库时间"],...displayedInventoryRows.map(item=>[item.customer,handledBy(item),inboundCode(item),boxNumber(item),outboundCode(item),String(item.imei||""),item.model,item.color,item.capacity,item.status,formatDate(item.receivedAt),item.status===STATUS.SHIPPED?formatDate(item.shippedAt):""])];
    await writeXlsx(rows,"全部逐台历史",`${customer}_逐台历史_${dateKey()}.xlsx`);return;
  }
  const chosenDate=mode==="today"?dateKey():($("#inventoryDate").value||dateKey());
  const events=displayedInventoryRows;
  const total=type=>events.filter(item=>item.type===type).reduce((sum,item)=>sum+item.quantity,0);
  const summaryRows=[["日期","客户范围","搜索条件","扫码入库","扫码出库","期初库存","手动增加","手动减少","净变化"],[chosenDate,customer,query,total("扫码入库"),total("扫码出库"),total("期初库存"),total("手动增加"),total("手动减少"),events.reduce((sum,item)=>sum+item.delta,0)]];
  const phoneRows=list=>[["客户","经手人","入库码","箱号","出库码","IMEI","型号","颜色","容量","时间"],...list.map(item=>[item.customer,handledBy(item),inboundCode(item),boxNumber(item),outboundCode(item),String(item.imei||""),item.model,item.color,item.capacity,formatDate(item.timestamp)])];
  const adjustmentRows=[["时间","客户","型号","颜色","容量","操作","数量","备注"],...events.filter(item=>!["扫码入库","扫码出库"].includes(item.type)).map(item=>[formatDate(item.timestamp),item.customer,item.model,item.color,item.capacity,item.type,item.quantity,item.note||""])];
  await writeWorkbook([{name:"当日汇总",rows:summaryRows},{name:"扫码入库明细",rows:phoneRows(events.filter(item=>item.type==="扫码入库"))},{name:"扫码出库明细",rows:phoneRows(events.filter(item=>item.type==="扫码出库"))},{name:"手动调整",rows:adjustmentRows}],`${customer}_${chosenDate}_出入库.xlsx`);
}

function showView(id){$$('.view').forEach(view=>view.classList.toggle("active",view.id===id));$$('nav button').forEach(button=>button.classList.toggle("active",button.dataset.view===id));$("#title").textContent=VIEW_CONTENT[id][0];$("#subtitle").textContent=VIEW_CONTENT[id][1];requestAnimationFrame(()=>{resizeDynamicTables();if(id==="receive")$("#imei").focus();});}
async function addCustomer(){const value=$("#newCustomer").value.trim();if(!value){await refocusInput("#newCustomer");return;}if(customers.some(item=>item.toLowerCase()===value.toLowerCase())){alert("这个客户已经存在。");await refocusInput("#newCustomer");return;}customers.push(value);customers=uniqueSorted(customers);if(await save()){$("#newCustomer").value="";render();}else customers=customers.filter(item=>item!==value);await refocusInput("#newCustomer");}
async function backupData(){try{$("#exportMenu").removeAttribute("open");const result=await window.inventoryDesktop.backup(allData());if(!result.canceled)alert(`完整备份已保存：\n${result.path}`);}catch(error){console.error(error);alert("备份失败，请重试。");}}
function showImportSummary(summary,backupPath){
  const duplicates=summary.duplicateCustomers+summary.duplicateProducts+summary.duplicatePhones+summary.duplicateAdjustments;
  const conflicts=summary.conflictProducts+summary.conflictPhones+summary.conflictAdjustments;
  const element=$("#importSummary");
  element.hidden=false;
  element.innerHTML=`<strong>导入完成，当前数据没有被覆盖。</strong>新增：客户 ${summary.addedCustomers}、UPC ${summary.addedProducts}、手机 ${summary.addedPhones}、调整记录 ${summary.addedAdjustments}<br>重复跳过：${duplicates} 条<br>冲突处理：${conflicts} 条${summary.updatedPhones?`（其中 ${summary.updatedPhones} 台手机更新为较新的出库状态）`:""}${summary.updatedProducts?`（${summary.updatedProducts} 个 UPC 补充了自定义配色）`:""}<br><small>同一 IMEI 以已出库状态为准；其他字段冲突保留当前设备数据。<br>导入前备份：${escapeHtml(backupPath||"")}</small>`;
}
async function importData(){
  try{
    const result=await window.inventoryDesktop.importData();if(result.canceled)return;
    const merged=window.InventoryData.mergeInventoryData(allData(),result.data);
    const saved=await window.inventoryDesktop.saveMerged(merged.data);
    ({customers,products,phones,adjustments}=merged.data);
    setSaveState("● 已自动保存");
    render();showView("data");showImportSummary(merged.summary,saved.backupPath);
  }catch(error){console.error(error);alert("导入失败。请选择本软件导出的完整 JSON 备份文件。");await refocusInput("#importData");}
}
async function resetData(){
  const first=confirm("Reset 会清空客户和库存业务数据。\n\n将删除：客户、库存、逐台出入库记录和调整记录。\n将保留：UPC 型号库中的全部资料，包括预设和后来添加的 UPC。\n\n继续吗？");
  if(!first){await refocusInput("#newCustomer");return;}
  const second=confirm("请再次确认：确定 Reset 客户和库存数据？\n\n全部 UPC 都会保留。系统会先自动创建一份完整备份，然后执行重置。");
  if(!second){await refocusInput("#newCustomer");return;}
  try{
    const initialData={version:2,customers:[],products:products.map(product=>({...product})),phones:[],adjustments:[]};
    const result=await window.inventoryDesktop.reset(initialData);
    ({customers,products,phones,adjustments}=result.data);
    render();showView("data");
    setSaveState("● 已自动保存");
    alert(`Reset 完成。客户和库存数据已清空，全部 UPC 已保留。\n\n重置前备份：\n${result.backupPath}`);
    await refocusInput("#newCustomer");
  }catch(error){console.error(error);alert("Reset 失败，当前数据没有被替换。请确认软件文件夹可以写入后重试。");await refocusInput("#newCustomer");}
}

function bind(){
  installDialogFocusRecovery();
  document.addEventListener("focusin",event=>{if(event.target.matches?.("input, select, textarea"))lastEditableControl=event.target;});
  window.addEventListener("resize",resizeDynamicTables);
  $$('nav button').forEach(button=>button.onclick=()=>showView(button.dataset.view));
  $("#inboundCode").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();$("#boxNumber").focus();}};
  $("#boxNumber").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();$("#handledBy").focus();}};
  $("#handledBy").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();$("#imei").focus();}};
  $("#imei").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();validateImeiBeforeUpc();}};
  $("#imei").oninput=()=>{if($("#imei").classList.contains("input-error")){clearImeiError();$("#message").textContent="正在读取新的 IMEI…";}};
  $("#upc").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();receivePhone();}};
  $("#receiveBtn").onclick=receivePhone;
  $("#shipImei").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();shipScannedImei();}};
  $("#outboundCode").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();$("#shipImei").focus();}};
  $("#shipScanBtn").onclick=shipScannedImei;
  $("#adjustmentForm").onsubmit=submitAdjustment;$("#adjustModel").onchange=refreshAdjustmentColors;$("#adjustColor").onchange=refreshAdjustmentCapacities;
  $("#productForm").onsubmit=submitProduct;$("#csvImport").onchange=importCsv;
  $("#inventoryCustomerFilter").onchange=renderInventory;$("#inventoryMode").onchange=renderInventory;$("#inventorySearch").oninput=renderInventory;
  $("#inventoryDateButton").onclick=toggleInventoryCalendar;
  $("#inventoryCalendarPrev").onclick=()=>{inventoryCalendarMonth=new Date(inventoryCalendarMonth.getFullYear(),inventoryCalendarMonth.getMonth()-1,1);renderInventoryCalendar();};
  $("#inventoryCalendarNext").onclick=()=>{inventoryCalendarMonth=new Date(inventoryCalendarMonth.getFullYear(),inventoryCalendarMonth.getMonth()+1,1);renderInventoryCalendar();};
  document.addEventListener("click",event=>{if(!event.target.closest?.(".marked-date-picker")){$("#inventoryCalendar").hidden=true;$("#inventoryDateButton").setAttribute("aria-expanded","false");}});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"){$("#inventoryCalendar").hidden=true;$("#inventoryDateButton").setAttribute("aria-expanded","false");}});
  $("#autoProductColors").onclick=applyAutomaticProductColors;
  $("#pColor").oninput=()=>{if(!productColorsCustomized)applyAutomaticProductColors();else updateProductColorPreview();};
  ["#pModel","#pCapacity"].forEach(id=>$(id).oninput=updateProductColorPreview);
  ["#pLabelBg","#pLabelText"].forEach(id=>$(id).oninput=()=>{productColorsCustomized=true;updateProductColorPreview();});
  $("#exportInStockDetails").onclick=exportInStockDetails;$("#exportInventoryCurrent").onclick=exportInventoryCurrent;$("#exportCustomerShippedToday").onclick=exportShippedToday;
  $("#batchCustomerFilter").onchange=renderTodayBatches;$("#batchInboundFilter").onchange=renderTodayBatches;$("#batchSearch").oninput=renderTodayBatches;$("#exportTodayBatches").onclick=exportTodayByInboundCode;
  $("#receiveCustomer").onchange=()=>{clearImeiError();$("#message").textContent=$("#receiveCustomer").value?"入库码、箱号和经手人会保持；请连续扫描 IMEI 与 UPC":"请先选择客户";$("#imei").focus();};
  $("#addCustomer").onclick=addCustomer;$("#newCustomer").onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();addCustomer();}};
  $("#importData").onclick=importData;$("#backupData").onclick=backupData;$("#exportDailyLedger").onclick=exportDailyLedger;$("#exportTodayByInboundCode").onclick=exportTodayByInboundCode;$("#resetData").onclick=resetData;
}

async function init(){
  bind();
  $("#inventoryDate").value=dateKey();
  setCalendarMonthFromDate($("#inventoryDate").value);
  try{
    const result=await window.inventoryDesktop.load();
    customers=uniqueSorted(result.data.customers||[]);
    products=(result.data.products||[]).length?result.data.products:[...DEFAULT_PRODUCTS];
    phones=(result.data.phones||[]).map(normalizePhoneCodes);adjustments=result.data.adjustments||[];
    setSaveState("● 已自动保存");
    if(!(result.data.products||[]).length)await save();
  }catch(error){console.error(error);setSaveState("⚠ 保存失败","error");}
  applyAutomaticProductColors();render();$("#imei").focus();
  setInterval(()=>{if($("#batches").classList.contains("active"))renderTodayBatches();$("#todayCount").textContent=phones.filter(phone=>dateKey(phone.receivedAt)===dateKey()).length;},60000);
}
init();
