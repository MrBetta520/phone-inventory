/*============================================================================================================================
const PKEY='phone_inventory_products_v1', IKEY='phone_inventory_phones_v1';
const demo=[{upc:'195950685784',model:'iPhone 16 Pro Max',color:'沙漠金色',capacity:'256GB'},{upc:'195950385417',model:'iPhone 16 Pro',color:'原色钛金属',capacity:'256GB'}];
let products=JSON.parse(localStorage.getItem(PKEY)||'null')||demo, phones=JSON.parse(localStorage.getItem(IKEY)||'[]');
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], save=()=>{localStorage.setItem(PKEY,JSON.stringify(products));localStorage.setItem(IKEY,JSON.stringify(phones));render()};
const fmt=x=>new Date(x).toLocaleString('zh-CN',{hour12:false});
function stats(){const stock=phones.filter(x=>x.status==='库存中'),m={};stock.forEach(x=>{let k=[x.model,x.color,x.capacity].join(' · ');m[k]=(m[k]||0)+1});return {stock,list:Object.entries(m).sort((a,b)=>b[1]-a[1])}}
function render(){const s=stats(),today=new Date().toLocaleDateString('zh-CN');$('#stockCount').textContent=s.stock.length;$('#todayCount').textContent=phones.filter(x=>new Date(x.receivedAt).toLocaleDateString('zh-CN')===today).length;$('#shippedCount').textContent=phones.filter(x=>x.status==='已出库').length;$('#modelCount').textContent=s.list.length;
 $('#stats').innerHTML=s.list.length?s.list.slice(0,6).map(([k,n])=>`<div class="row"><span>${k}</span><b>${n}</b></div><div class="bar"><i style="width:${Math.max(8,n/s.stock.length*100)}%"></i></div>`).join(''):'<div class="empty">还没有库存数据</div>';
 $('#recent').innerHTML=phones.length?phones.slice(0,5).map(x=>`<div class="row"><span><b>${x.model}</b><br><span class="muted">${x.color} · ${x.capacity}</span></span><small>${x.imei.slice(-6)}</small></div>`).join(''):'<div class="empty">扫码入库后会显示在这里</div>';tables();productsTable()}
function rows(items,ship=false){return `<table><thead><tr><th>手机</th><th>IMEI</th><th>快递单号</th><th>UPC</th><th>状态</th><th>入库时间</th>${ship?'<th></th>':''}</tr></thead><tbody>`+items.map(x=>`<tr><td><b>${x.model}</b><br><span class="muted">${x.color} · ${x.capacity}</span></td><td>${x.imei}</td><td>${x.tracking}</td><td>${x.upc}</td><td><span class="tag">${x.status}</span></td><td>${fmt(x.receivedAt)}</td>${ship?`<td><button class="danger" data-ship="${x.imei}">确认出库</button></td>`:''}</tr>`).join('')+'</tbody></table>'}
function tables(q=''){let match=x=>[x.tracking,x.imei,x.upc,x.model,x.color,x.capacity].join(' ').toLowerCase().includes(q.toLowerCase());$('#stockTable').innerHTML=rows(phones.filter(match));$('#shipTable').innerHTML=rows(phones.filter(x=>x.status==='库存中'&&match(x)),true);$$('[data-ship]').forEach(b=>b.onclick=()=>{if(confirm('确认将这部手机标记为已出库？')){phones=phones.map(x=>x.imei===b.dataset.ship?{...x,status:'已出库',shippedAt:new Date().toISOString()}:x);save()}})}
function productsTable(){$('#productTable').innerHTML=`<table><thead><tr><th>UPC</th><th>型号</th><th>颜色</th><th>容量</th><th></th></tr></thead><tbody>`+products.map(x=>`<tr><td>${x.upc}</td><td><b>${x.model}</b></td><td>${x.color}</td><td>${x.capacity}</td><td><button class="delete" data-del="${x.upc}">删除</button></td></tr>`).join('')+'</tbody></table>';$$('[data-del]').forEach(b=>b.onclick=()=>{products=products.filter(x=>x.upc!==b.dataset.del);save()})}
function receive(){let tracking=$('#tracking').value.trim(),imei=$('#imei').value.trim(),upc=$('#upc').value.trim(),msg=$('#message');if(!tracking||!imei||!upc)return msg.textContent='三个条码都必须扫描';if(phones.some(x=>x.tracking===tracking))return msg.textContent='⚠️ 这个快递单号已经录入';if(phones.some(x=>x.imei===imei))return msg.textContent='⚠️ 这个 IMEI 已经录入';let p=products.find(x=>x.upc===upc);if(!p){msg.textContent='⚠️ UPC 型号库中没有这个代码，请先添加型号';show('products');$('#pUpc').value=upc;return}phones.unshift({...p,tracking,imei,status:'库存中',receivedAt:new Date().toISOString()});['tracking','imei','upc'].forEach(x=>$('#'+x).value='');msg.textContent=`✅ 已入库：${p.model} · ${p.color} · ${p.capacity}`;save();$('#tracking').focus()}
function show(id){$$('.view').forEach(x=>x.classList.toggle('active',x.id===id));$$('nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===id));let map={receive:['入库扫码','按顺序扫描三个条码，系统会自动跳到下一栏'],stock:['当前库存','查看所有手机的库存状态'],ship:['出库管理','搜索手机并确认出库'],products:['UPC 型号库','维护 UPC 与手机型号的对应关系']};$('#title').textContent=map[id][0];$('#subtitle').textContent=map[id][1]}
$$('nav button').forEach(b=>b.onclick=()=>show(b.dataset.view));$('#tracking').onkeydown=e=>{if(e.key==='Enter')$('#imei').focus()};$('#imei').onkeydown=e=>{if(e.key==='Enter')$('#upc').focus()};$('#upc').onkeydown=e=>{if(e.key==='Enter')receive()};$('#receiveBtn').onclick=receive;$$('.search').forEach(x=>x.oninput=()=>tables(x.value));
$('#productForm').onsubmit=e=>{e.preventDefault();let p={upc:$('#pUpc').value.trim(),model:$('#pModel').value.trim(),color:$('#pColor').value.trim(),capacity:$('#pCapacity').value.trim()};products=[p,...products.filter(x=>x.upc!==p.upc)];e.target.reset();save()};
$('#csvImport').onchange=e=>{let r=new FileReader;r.onload=()=>{let a=String(r.result).replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).slice(1).map(x=>{let [upc,model,color,capacity]=x.split(',').map(v=>v.replace(/^"|"$/g,'').trim());return{upc,model,color,capacity}}).filter(x=>x.upc&&x.model);products=[...a,...products.filter(x=>!a.some(y=>y.upc===x.upc))];save()};if(e.target.files[0])r.readAsText(e.target.files[0])};
$('#export').onclick=()=>{let h=['快递单号','IMEI','UPC','型号','颜色','容量','状态','入库时间','出库时间'],esc=x=>'"'+String(x||'').replaceAll('"','""')+'"',data=[h,...phones.map(x=>[x.tracking,x.imei,x.upc,x.model,x.color,x.capacity,x.status,fmt(x.receivedAt),x.shippedAt?fmt(x.shippedAt):''])].map(r=>r.map(esc).join(',')).join('\r\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+data],{type:'text/csv'}));a.download=`手机库存_${new Date().toISOString().slice(0,10)}.csv`;a.click()};render();$('#tracking').focus();

============================================================================================================================*/

"use strict";

/* =========================================================
   1. 配置与默认数据
   ========================================================= */

const STORAGE_KEYS = {
  products: "phone_inventory_products_v1",
  phones: "phone_inventory_phones_v1",
};

const DEFAULT_PRODUCTS = [
  {
    upc: "195950685784",
    model: "iPhone 16 Pro Max",
    color: "沙漠金色",
    capacity: "256GB",
  },
  {
    upc: "195950385417",
    model: "iPhone 16 Pro",
    color: "原色钛金属",
    capacity: "256GB",
  },
  {
    upc: "195950637151",
    model: "iPhone 17 Pro Max",
    color: "银色",
    capacity: "256GB",
  },
  {
    upc: "195950626162",
    model: "iPhone 17 Pro",
    color: "银色",
    capacity: "256GB",
  },
  {
    upc: "195950638035",
    model: "iPhone 17 Pro Max",
    color: "橙色",
    capacity: "512GB",
  },
  {
    upc: "195950638028",
    model: "iPhone 17 Pro Max",
    color: "银色",
    capacity: "512GB",
  },
  {
    upc: "195950638011",
    model: "iPhone 17 Pro Max",
    color: "蓝色",
    capacity: "256GB",
  },
  {
    upc: "195950638004",
    model: "iPhone 17 Pro Max",
    color: "橙色",
    capacity: "256GB",
  },
];

const VIEW_INFORMATION = {
  receive: {
    title: "入库扫码",
    subtitle: "按顺序扫描三个条码，系统会自动跳到下一栏",
  },
  stock: {
    title: "当前库存",
    subtitle: "查看所有手机的库存状态",
  },
  ship: {
    title: "出库管理",
    subtitle: "搜索手机并确认出库",
  },
  products: {
    title: "UPC 型号库",
    subtitle: "维护 UPC 与手机型号的对应关系",
  },
};


/* =========================================================
   2. 页面元素工具
   ========================================================= */

const getElement = (selector) => document.querySelector(selector);

const getElements = (selector) => [
  ...document.querySelectorAll(selector),
];


/**
 * 将特殊字符转换为安全的 HTML 字符。
 * 避免用户输入的内容破坏页面结构。
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   3. 本地数据管理
   ========================================================= */

function loadJsonFromStorage(key, fallbackValue) {
  try {
    const savedValue = localStorage.getItem(key);

    if (!savedValue) {
      return fallbackValue;
    }

    const parsedValue = JSON.parse(savedValue);

    return Array.isArray(parsedValue)
      ? parsedValue
      : fallbackValue;
  } catch (error) {
    console.error(`读取本地数据失败：${key}`, error);
    return fallbackValue;
  }
}


/**
 * 合并默认 UPC 和用户已经保存的 UPC。
 *
 * 如果 UPC 相同，优先保留用户已经保存的资料；
 * 新增加的默认 UPC 会自动加入，不需要清除浏览器数据。
 */
function mergeDefaultProducts(savedProducts) {
  const mergedProducts = [...savedProducts];

  DEFAULT_PRODUCTS.forEach((defaultProduct) => {
    const alreadyExists = mergedProducts.some(
      (product) => product.upc === defaultProduct.upc
    );

    if (!alreadyExists) {
      mergedProducts.push(defaultProduct);
    }
  });

  return mergedProducts;
}


let products = mergeDefaultProducts(
  loadJsonFromStorage(STORAGE_KEYS.products, [])
);

let phones = loadJsonFromStorage(
  STORAGE_KEYS.phones,
  []
);


function saveData() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.products,
      JSON.stringify(products)
    );

    localStorage.setItem(
      STORAGE_KEYS.phones,
      JSON.stringify(phones)
    );
  } catch (error) {
    console.error("保存本地数据失败", error);
    alert("数据保存失败，请检查浏览器是否允许本地存储。");
    return;
  }

  renderApp();
}


/* =========================================================
   4. 日期与统计工具
   ========================================================= */

function formatDateTime(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}


function getLocalDateKey(dateValue = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateValue));
}


function getInventoryStatistics() {
  const phonesInStock = phones.filter(
    (phone) => phone.status === "库存中"
  );

  const groupedInventory = {};

  phonesInStock.forEach((phone) => {
    const groupName = [
      phone.model,
      phone.color,
      phone.capacity,
    ].join(" · ");

    groupedInventory[groupName] =
      (groupedInventory[groupName] || 0) + 1;
  });

  const groupedList = Object.entries(groupedInventory).sort(
    (firstItem, secondItem) => secondItem[1] - firstItem[1]
  );

  return {
    phonesInStock,
    groupedList,
  };
}


/* =========================================================
   5. 首页和统计渲染
   ========================================================= */

function renderDashboard() {
  const statistics = getInventoryStatistics();
  const today = getLocalDateKey();

  const receivedToday = phones.filter((phone) => {
    return getLocalDateKey(phone.receivedAt) === today;
  });

  const shippedPhones = phones.filter(
    (phone) => phone.status === "已出库"
  );

  getElement("#stockCount").textContent =
    statistics.phonesInStock.length;

  getElement("#todayCount").textContent =
    receivedToday.length;

  getElement("#shippedCount").textContent =
    shippedPhones.length;

  getElement("#modelCount").textContent =
    statistics.groupedList.length;

  renderInventoryChart(statistics);
  renderRecentPhones();
}


function renderInventoryChart(statistics) {
  const statsContainer = getElement("#stats");

  if (statistics.groupedList.length === 0) {
    statsContainer.textContent = "还没有库存数据";
    return;
  }

  const totalStock = statistics.phonesInStock.length;

  statsContainer.innerHTML = statistics.groupedList
    .slice(0, 6)
    .map(([groupName, quantity]) => {
      const percentage = totalStock > 0
        ? Math.max(8, (quantity / totalStock) * 100)
        : 0;

      return `
        <div class="row">
          <span>${escapeHtml(groupName)}</span>
          <b>${quantity}</b>
        </div>

        <div class="bar">
          <i style="width: ${percentage}%"></i>
        </div>
      `;
    })
    .join("");
}


function renderRecentPhones() {
  const recentContainer = getElement("#recent");

  if (phones.length === 0) {
    recentContainer.textContent = "扫码入库后会显示在这里";
    return;
  }

  recentContainer.innerHTML = phones
    .slice(0, 5)
    .map((phone) => {
      const imeiEnding = String(phone.imei || "").slice(-6);

      return `
        <div class="row">
          <span>
            <b>${escapeHtml(phone.model)}</b>
            <br>
            <span class="muted">
              ${escapeHtml(phone.color)}
              ·
              ${escapeHtml(phone.capacity)}
            </span>
          </span>

          <small>${escapeHtml(imeiEnding)}</small>
        </div>
      `;
    })
    .join("");
}


/* =========================================================
   6. 库存与出库表格
   ========================================================= */

function createPhoneTable(phoneList, showShipButton = false) {
  const tableRows = phoneList
    .map((phone) => {
      const actionColumn = showShipButton
        ? `
          <td>
            <button
              type="button"
              class="ship-button"
              data-ship="${escapeHtml(phone.imei)}"
            >
              确认出库
            </button>
          </td>
        `
        : "";

      return `
        <tr>
          <td>
            <b>${escapeHtml(phone.model)}</b>
            <br>
            <span class="muted">
              ${escapeHtml(phone.color)}
              ·
              ${escapeHtml(phone.capacity)}
            </span>
          </td>

          <td>${escapeHtml(phone.imei)}</td>
          <td>${escapeHtml(phone.tracking)}</td>
          <td>${escapeHtml(phone.upc)}</td>

          <td>
            <span class="tag">
              ${escapeHtml(phone.status)}
            </span>
          </td>

          <td>${escapeHtml(formatDateTime(phone.receivedAt))}</td>

          ${actionColumn}
        </tr>
      `;
    })
    .join("");

  const actionHeader = showShipButton
    ? "<th>操作</th>"
    : "";

  const emptyColspan = showShipButton ? 7 : 6;

  const bodyContent = tableRows || `
    <tr>
      <td colspan="${emptyColspan}" class="muted">
        没有符合条件的数据
      </td>
    </tr>
  `;

  return `
    <table>
      <thead>
        <tr>
          <th>手机</th>
          <th>IMEI</th>
          <th>快递单号</th>
          <th>UPC</th>
          <th>状态</th>
          <th>入库时间</th>
          ${actionHeader}
        </tr>
      </thead>

      <tbody>
        ${bodyContent}
      </tbody>
    </table>
  `;
}


function phoneMatchesSearch(phone, searchText) {
  const searchableText = [
    phone.tracking,
    phone.imei,
    phone.upc,
    phone.model,
    phone.color,
    phone.capacity,
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(searchText.toLowerCase());
}


function renderInventoryTables(searchText = "") {
  const matchingPhones = phones.filter((phone) => {
    return phoneMatchesSearch(phone, searchText);
  });

  const matchingPhonesInStock = matchingPhones.filter(
    (phone) => phone.status === "库存中"
  );

  getElement("#stockTable").innerHTML =
    createPhoneTable(matchingPhones);

  getElement("#shipTable").innerHTML =
    createPhoneTable(matchingPhonesInStock, true);

  bindShipButtonEvents();
}


function bindShipButtonEvents() {
  getElements("[data-ship]").forEach((button) => {
    button.addEventListener("click", () => {
      shipPhone(button.dataset.ship);
    });
  });
}


function shipPhone(imei) {
  const phone = phones.find(
    (item) => item.imei === imei
  );

  if (!phone) {
    alert("没有找到这部手机。");
    return;
  }

  const confirmed = window.confirm(
    `确认将这部手机标记为已出库？\n\n${phone.model} · ${phone.color} · ${phone.capacity}\nIMEI：${phone.imei}`
  );

  if (!confirmed) {
    return;
  }

  phones = phones.map((item) => {
    if (item.imei !== imei) {
      return item;
    }

    return {
      ...item,
      status: "已出库",
      shippedAt: new Date().toISOString(),
    };
  });

  saveData();
}


/* =========================================================
   7. UPC 型号库
   ========================================================= */

function renderProductsTable() {
  const productRows = products
    .map((product) => {
      return `
        <tr>
          <td>${escapeHtml(product.upc)}</td>
          <td><b>${escapeHtml(product.model)}</b></td>
          <td>${escapeHtml(product.color)}</td>
          <td>${escapeHtml(product.capacity)}</td>

          <td>
            <button
              type="button"
              class="delete"
              data-delete-product="${escapeHtml(product.upc)}"
            >
              删除
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  const bodyContent = productRows || `
    <tr>
      <td colspan="5" class="muted">
        UPC 型号库为空
      </td>
    </tr>
  `;

  getElement("#productTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>UPC</th>
          <th>型号</th>
          <th>颜色</th>
          <th>容量</th>
          <th>操作</th>
        </tr>
      </thead>

      <tbody>
        ${bodyContent}
      </tbody>
    </table>
  `;

  bindProductDeleteEvents();
}


function bindProductDeleteEvents() {
  getElements("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteProduct(button.dataset.deleteProduct);
    });
  });
}


function deleteProduct(upc) {
  const product = products.find(
    (item) => item.upc === upc
  );

  if (!product) {
    return;
  }

  const confirmed = window.confirm(
    `确认删除这个 UPC？\n\n${product.model} · ${product.color} · ${product.capacity}\nUPC：${product.upc}`
  );

  if (!confirmed) {
    return;
  }

  products = products.filter(
    (item) => item.upc !== upc
  );

  saveData();
}


function addOrUpdateProduct(event) {
  event.preventDefault();

  const product = {
    upc: getElement("#pUpc").value.trim(),
    model: getElement("#pModel").value.trim(),
    color: getElement("#pColor").value.trim(),
    capacity: getElement("#pCapacity").value.trim(),
  };

  if (
    !product.upc ||
    !product.model ||
    !product.color ||
    !product.capacity
  ) {
    alert("请填写完整的 UPC、型号、颜色和容量。");
    return;
  }

  products = [
    product,
    ...products.filter(
      (item) => item.upc !== product.upc
    ),
  ];

  event.target.reset();
  saveData();
}


/* =========================================================
   8. 手机入库
   ========================================================= */

function setReceiveMessage(message) {
  getElement("#message").textContent = message;
}


function receivePhone() {
  const tracking = getElement("#tracking").value.trim();
  const imei = getElement("#imei").value.trim();
  const upc = getElement("#upc").value.trim();

  if (!tracking || !imei || !upc) {
    setReceiveMessage("三个条码都必须扫描");
    return;
  }

  const trackingAlreadyExists = phones.some(
    (phone) => phone.tracking === tracking
  );

  if (trackingAlreadyExists) {
    setReceiveMessage("⚠️ 这个快递单号已经录入");
    return;
  }

  const imeiAlreadyExists = phones.some(
    (phone) => phone.imei === imei
  );

  if (imeiAlreadyExists) {
    setReceiveMessage("⚠️ 这个 IMEI 已经录入");
    return;
  }

  const matchingProduct = products.find(
    (product) => product.upc === upc
  );

  if (!matchingProduct) {
    setReceiveMessage(
      "⚠️ UPC 型号库中没有这个代码，请先添加型号"
    );

    showView("products");
    getElement("#pUpc").value = upc;
    getElement("#pModel").focus();
    return;
  }

  const newPhone = {
    ...matchingProduct,
    tracking,
    imei,
    status: "库存中",
    receivedAt: new Date().toISOString(),
    shippedAt: null,
  };

  phones.unshift(newPhone);

  clearReceiveForm();

  setReceiveMessage(
    `✅ 已入库：${matchingProduct.model} · ${matchingProduct.color} · ${matchingProduct.capacity}`
  );

  saveData();
  getElement("#tracking").focus();
}


function clearReceiveForm() {
  ["tracking", "imei", "upc"].forEach((fieldId) => {
    getElement(`#${fieldId}`).value = "";
  });
}


/* =========================================================
   9. 页面切换
   ========================================================= */

function showView(viewId) {
  getElements(".view").forEach((view) => {
    view.classList.toggle(
      "active",
      view.id === viewId
    );
  });

  getElements("nav button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.view === viewId
    );
  });

  const information = VIEW_INFORMATION[viewId];

  if (!information) {
    return;
  }

  getElement("#title").textContent =
    information.title;

  getElement("#subtitle").textContent =
    information.subtitle;
}


/* =========================================================
   10. CSV 导入
   ========================================================= */

function parseCsvLine(line) {
  const values = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && insideQuotes && nextCharacter === '"') {
      currentValue += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue.trim());

  return values;
}


function importProductsFromCsv(event) {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const fileContent = String(reader.result)
        .replace(/^\uFEFF/, "");

      const lines = fileContent
        .split(/\r?\n/)
        .filter((line) => line.trim());

      if (lines.length < 2) {
        alert("CSV 文件中没有可以导入的数据。");
        return;
      }

      const importedProducts = lines
        .slice(1)
        .map((line) => {
          const [
            upc,
            model,
            color,
            capacity,
          ] = parseCsvLine(line);

          return {
            upc: String(upc || "").trim(),
            model: String(model || "").trim(),
            color: String(color || "").trim(),
            capacity: String(capacity || "").trim(),
          };
        })
        .filter((product) => {
          return product.upc && product.model;
        });

      products = [
        ...importedProducts,
        ...products.filter((existingProduct) => {
          return !importedProducts.some(
            (importedProduct) =>
              importedProduct.upc === existingProduct.upc
          );
        }),
      ];

      saveData();

      alert(`成功导入 ${importedProducts.length} 条 UPC 资料。`);
    } catch (error) {
      console.error("CSV 导入失败", error);
      alert("CSV 导入失败，请检查文件格式。");
    } finally {
      event.target.value = "";
    }
  };

  reader.onerror = () => {
    alert("无法读取 CSV 文件。");
  };

  reader.readAsText(file);
}


/* =========================================================
   11. CSV 导出
   ========================================================= */

function escapeCsvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}


function exportInventoryToCsv() {
  const headers = [
    "快递单号",
    "IMEI",
    "型号",
    "颜色",
    "容量",
    "状态",
    "入库时间",
    "出库时间",
  ];

  const dataRows = phones.map((phone) => [
    phone.tracking,
    phone.imei,
    phone.model,
    phone.color,
    phone.capacity,
    phone.status,
    formatDateTime(phone.receivedAt),
    phone.shippedAt
      ? formatDateTime(phone.shippedAt)
      : "",
  ]);

  const csvContent = [headers, ...dataRows]
    .map((row) => {
      return row.map(escapeCsvValue).join(",");
    })
    .join("\r\n");

  const csvBlob = new Blob(
    [`\uFEFF${csvContent}`],
    {
      type: "text/csv;charset=utf-8",
    }
  );

  const downloadUrl = URL.createObjectURL(csvBlob);
  const downloadLink = document.createElement("a");

  downloadLink.href = downloadUrl;
  downloadLink.download =
    `手机库存_${new Date().toISOString().slice(0, 10)}.csv`;

  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  URL.revokeObjectURL(downloadUrl);
}


/* =========================================================
   12. 事件绑定
   ========================================================= */

function bindNavigationEvents() {
  getElements("nav button").forEach((button) => {
    button.addEventListener("click", () => {
      showView(button.dataset.view);
    });
  });
}


function bindScannerEvents() {
  getElement("#tracking").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      getElement("#imei").focus();
    }
  });

  getElement("#imei").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      getElement("#upc").focus();
    }
  });

  getElement("#upc").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      receivePhone();
    }
  });

  getElement("#receiveBtn").addEventListener(
    "click",
    receivePhone
  );
}


function bindSearchEvents() {
  getElements(".search").forEach((searchInput) => {
    searchInput.addEventListener("input", (event) => {
      renderInventoryTables(event.target.value);
    });
  });
}


function bindFormEvents() {
  getElement("#productForm").addEventListener(
    "submit",
    addOrUpdateProduct
  );

  getElement("#csvImport").addEventListener(
    "change",
    importProductsFromCsv
  );

  getElement("#export").addEventListener(
    "click",
    exportInventoryToCsv
  );
}


function bindAllEvents() {
  bindNavigationEvents();
  bindScannerEvents();
  bindSearchEvents();
  bindFormEvents();
}


/* =========================================================
   13. 应用初始化
   ========================================================= */

function renderApp() {
  renderDashboard();
  renderInventoryTables();
  renderProductsTable();
}


function initializeApp() {
  /*
   * 第一次启动时保存合并后的默认 UPC。
   * 不会删除或覆盖用户原来保存的库存记录。
   */
  localStorage.setItem(
    STORAGE_KEYS.products,
    JSON.stringify(products)
  );

  bindAllEvents();
  renderApp();

  getElement("#tracking").focus();
}


initializeApp();