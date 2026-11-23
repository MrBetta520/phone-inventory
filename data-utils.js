(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.InventoryData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SHIPPED = "已出库";
  const clean = value => String(value ?? "").trim();
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const unique = values => {
    const map = new Map();
    for (const value of values.map(clean).filter(Boolean)) if (!map.has(value.toLocaleLowerCase())) map.set(value.toLocaleLowerCase(),value);
    return [...map.values()].sort((a,b)=>a.localeCompare(b,"zh-CN",{numeric:true}));
  };
  const later = (left, right) => {
    const leftTime = Date.parse(left || "") || 0;
    const rightTime = Date.parse(right || "") || 0;
    return rightTime > leftTime ? right : left;
  };
  const earlier = (left, right) => {
    const leftTime = Date.parse(left || "") || Number.MAX_SAFE_INTEGER;
    const rightTime = Date.parse(right || "") || Number.MAX_SAFE_INTEGER;
    if (leftTime === Number.MAX_SAFE_INTEGER && rightTime === Number.MAX_SAFE_INTEGER) return left || right || "";
    return rightTime < leftTime ? right : left;
  };
  const normalizePhoneCodes = item => {
    const normalized={...item,inboundCode:clean(item.inboundCode)||clean(item.tracking),boxNumber:clean(item.boxNumber)||clean(item.boxNo),outboundCode:clean(item.outboundCode)||clean(item.shipCode)};
    delete normalized.tracking;delete normalized.boxNo;delete normalized.shipCode;
    return normalized;
  };

  function mergeInventoryData(current, incoming) {
    const source = current || {};
    const addition = incoming || {};
    const summary = {
      addedCustomers: 0, duplicateCustomers: 0,
      addedProducts: 0, duplicateProducts: 0, conflictProducts: 0, updatedProducts: 0,
      addedPhones: 0, duplicatePhones: 0, conflictPhones: 0, updatedPhones: 0,
      addedAdjustments: 0, duplicateAdjustments: 0, conflictAdjustments: 0
    };

    const currentCustomers = unique(source.customers || []);
    const currentCustomerKeys = new Set(currentCustomers.map(value=>value.toLocaleLowerCase()));
    const mergedCustomers = [...currentCustomers];
    const importedCustomers = unique([
      ...(addition.customers || []),
      ...(addition.phones || []).map(item=>item.customer),
      ...(addition.adjustments || []).map(item=>item.customer)
    ]);
    for (const customer of importedCustomers) {
      const key = customer.toLocaleLowerCase();
      if (currentCustomerKeys.has(key)) summary.duplicateCustomers++;
      else { currentCustomerKeys.add(key); mergedCustomers.push(customer); summary.addedCustomers++; }
    }
    const canonicalCustomer = value => {
      const key=clean(value).toLocaleLowerCase();
      return mergedCustomers.find(customer=>customer.toLocaleLowerCase()===key)||clean(value);
    };

    const mergedProducts = (source.products || []).map(item=>({...item}));
    const productIndex = new Map(mergedProducts.map((item,index)=>[clean(item.upc),index]).filter(([key])=>key));
    for (const imported of addition.products || []) {
      const key = clean(imported.upc);
      if (!key) continue;
      const normalized = {...imported,upc:key};
      if (!productIndex.has(key)) {
        productIndex.set(key,mergedProducts.length);mergedProducts.push(normalized);summary.addedProducts++;
      } else {
        const existing = mergedProducts[productIndex.get(key)];
        const fields = ["model","color","capacity","labelBg","labelText"];
        const existingFields = fields.map(field=>clean(existing[field]));
        const incomingFields = fields.map(field=>clean(normalized[field]));
        if (same(existingFields,incomingFields)) summary.duplicateProducts++;
        else {
          summary.conflictProducts++;
          const result={...existing};
          for (const field of ["labelBg","labelText"]) if (!clean(result[field]) && clean(normalized[field])) result[field]=normalized[field];
          if (!same(existingFields,fields.map(field=>clean(result[field])))) { mergedProducts[productIndex.get(key)]=result;summary.updatedProducts++; }
        }
      }
    }

    const mergedPhones = (source.phones || []).map(item=>({...normalizePhoneCodes(item),imei:clean(item.imei)}));
    const phoneIndex = new Map(mergedPhones.map((item,index)=>[clean(item.imei),index]).filter(([key])=>key));
    const phoneFields = ["customer","inboundCode","boxNumber","outboundCode","upc","model","color","capacity","status","receivedAt","shippedAt"];
    for (const imported of addition.phones || []) {
      const key = clean(imported.imei);
      if (!key) continue;
      const normalized = {...normalizePhoneCodes(imported),imei:key,customer:canonicalCustomer(imported.customer)};
      if (!phoneIndex.has(key)) {
        phoneIndex.set(key,mergedPhones.length);mergedPhones.push(normalized);summary.addedPhones++;
        continue;
      }
      const index = phoneIndex.get(key), existing = mergedPhones[index];
      const existingValues = phoneFields.map(field=>clean(existing[field]));
      const incomingValues = phoneFields.map(field=>clean(normalized[field]));
      if (same(existingValues,incomingValues)) { summary.duplicatePhones++; continue; }
      summary.conflictPhones++;
      const result = {...existing};
      for (const field of ["customer","inboundCode","boxNumber","outboundCode","upc","model","color","capacity"]) if (!clean(result[field]) && clean(normalized[field])) result[field]=normalized[field];
      result.receivedAt = earlier(existing.receivedAt,normalized.receivedAt);
      if (existing.status === SHIPPED || normalized.status === SHIPPED) {
        result.status = SHIPPED;
        result.shippedAt = later(existing.shippedAt,normalized.shippedAt);
      }
      if (!same(phoneFields.map(field=>clean(existing[field])),phoneFields.map(field=>clean(result[field])))) summary.updatedPhones++;
      mergedPhones[index]=result;
    }

    const mergedAdjustments = (source.adjustments || []).map(item=>({...item}));
    const adjustmentKey = item => clean(item.id) || `legacy:${JSON.stringify([item.customer,item.model,item.color,item.capacity,item.type,Number(item.quantity)||0,item.note,item.createdAt])}`;
    const adjustmentIndex = new Map(mergedAdjustments.map((item,index)=>[adjustmentKey(item),index]));
    const adjustmentFields = ["customer","model","color","capacity","type","quantity","note","createdAt"];
    for (const imported of addition.adjustments || []) {
      const key = adjustmentKey(imported);
      if (!adjustmentIndex.has(key)) {
        adjustmentIndex.set(key,mergedAdjustments.length);mergedAdjustments.push({...imported,customer:canonicalCustomer(imported.customer)});summary.addedAdjustments++;
      } else {
        const existing = mergedAdjustments[adjustmentIndex.get(key)];
        const existingValues = adjustmentFields.map(field=>field==="quantity"?Number(existing[field])||0:clean(existing[field]));
        const incomingValues = adjustmentFields.map(field=>field==="quantity"?Number(imported[field])||0:clean(imported[field]));
        if (same(existingValues,incomingValues)) summary.duplicateAdjustments++;
        else summary.conflictAdjustments++;
      }
    }

    const allCustomers = unique([
      ...mergedCustomers,
      ...mergedPhones.map(item=>item.customer),
      ...mergedAdjustments.map(item=>item.customer)
    ]);
    mergedPhones.sort((a,b)=>clean(b.receivedAt).localeCompare(clean(a.receivedAt)));
    mergedAdjustments.sort((a,b)=>clean(b.createdAt).localeCompare(clean(a.createdAt)));
    return { data:{version:2,customers:allCustomers,products:mergedProducts,phones:mergedPhones,adjustments:mergedAdjustments}, summary };
  }

  function localDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "日期未知";
    const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0");
    return `${year}-${month}-${day}`;
  }

  function buildDailyLedger(phones, adjustments) {
    const events = [];
    for (const phone of phones || []) {
      const normalized=normalizePhoneCodes(phone);
      if (phone.receivedAt) events.push({timestamp:phone.receivedAt,type:"扫码入库",customer:phone.customer,inboundCode:normalized.inboundCode,boxNumber:normalized.boxNumber,outboundCode:"",imei:phone.imei,model:phone.model,color:phone.color,capacity:phone.capacity,quantity:1,note:"",delta:1});
      if (phone.status === SHIPPED && phone.shippedAt) events.push({timestamp:phone.shippedAt,type:"扫码出库",customer:phone.customer,inboundCode:normalized.inboundCode,boxNumber:normalized.boxNumber,outboundCode:normalized.outboundCode,imei:phone.imei,model:phone.model,color:phone.color,capacity:phone.capacity,quantity:1,note:"",delta:-1});
    }
    const labels = {initial:"期初库存",increase:"手动增加",decrease:"手动减少"};
    for (const item of adjustments || []) {
      const quantity=Number(item.quantity)||0;
      let type=labels[item.type]||clean(item.type)||"库存调整";
      if (clean(item.note).startsWith("反向修正：")) type=`反向修正（${item.type==="decrease"?"减少":"增加"}）`;
      events.push({timestamp:item.createdAt,type,customer:item.customer,inboundCode:"",boxNumber:"",outboundCode:"",imei:"",model:item.model,color:item.color,capacity:item.capacity,quantity,note:item.note||"",delta:item.type==="decrease"?-quantity:quantity});
    }
    if (!events.length) return [];
    for (const event of events) event.date=localDateKey(event.timestamp);
    events.sort((a,b)=>clean(a.timestamp).localeCompare(clean(b.timestamp)));

    const summaryMap = new Map();
    for (const event of events) {
      const key=`${event.date}\u001f${clean(event.customer)||"未命名客户"}`;
      if (!summaryMap.has(key)) summaryMap.set(key,{date:event.date,customer:clean(event.customer)||"未命名客户",received:0,shipped:0,initial:0,increase:0,decrease:0,net:0});
      const row=summaryMap.get(key);
      if (event.type==="扫码入库") row.received+=event.quantity;
      else if (event.type==="扫码出库") row.shipped+=event.quantity;
      else if (event.type==="期初库存") row.initial+=event.quantity;
      else if (event.delta>=0) row.increase+=event.quantity;
      else row.decrease+=event.quantity;
      row.net+=event.delta;
    }
    const dateSort=(left,right)=>left===right?0:left==="日期未知"?1:right==="日期未知"?-1:right.localeCompare(left);
    const summaryRows=[...summaryMap.values()].sort((a,b)=>dateSort(a.date,b.date)||a.customer.localeCompare(b.customer,"zh-CN"));
    const sheets=[{name:"每日汇总",rows:[
      ["日期","客户","扫码入库","扫码出库","期初库存","手动增加","手动减少","净变化"],
      ...summaryRows.map(row=>[row.date,row.customer,row.received,row.shipped,row.initial,row.increase,row.decrease,row.net])
    ]}];
    const dates=[...new Set(events.map(event=>event.date))].sort(dateSort);
    for (const date of dates) {
      sheets.push({name:date,rows:[
        ["操作类型","客户","入库码","箱号","出库码","IMEI","型号","颜色","容量","数量","备注"],
        ...events.filter(event=>event.date===date).map(event=>[event.type,clean(event.customer)||"未命名客户",clean(event.inboundCode),clean(event.boxNumber),clean(event.outboundCode),clean(event.imei),clean(event.model),clean(event.color),clean(event.capacity),event.quantity,clean(event.note)])
      ]});
    }
    return sheets;
  }

  return { mergeInventoryData, buildDailyLedger, localDateKey };
});
