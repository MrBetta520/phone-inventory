"use strict";

(() => {
  const DB_NAME = "PhoneStockDB";
  const STORE_NAME = "inventory";
  const DATA_KEY = "current";
  const emptyData = () => ({version:2,customers:[],products:[],phones:[],adjustments:[]});
  const normalizeData = value => {
    const source=value&&typeof value==="object"?value:{};
    return {
      version:Number(source.version)||2,
      customers:Array.isArray(source.customers)?source.customers:[],
      products:Array.isArray(source.products)?source.products:[],
      phones:Array.isArray(source.phones)?source.phones:[],
      adjustments:Array.isArray(source.adjustments)?source.adjustments:[]
    };
  };
  const localDateKey = (value=new Date()) => {
    const date=new Date(value),year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0");
    return `${year}-${month}-${day}`;
  };
  const openDb = () => new Promise((resolve,reject) => {
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE_NAME);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  const dbRead = async () => {
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,"readonly");
      const request=transaction.objectStore(STORE_NAME).get(DATA_KEY);
      request.onsuccess=()=>resolve(normalizeData(request.result||emptyData()));
      request.onerror=()=>reject(request.error);
      transaction.oncomplete=()=>db.close();
    });
  };
  const dbWrite = async value => {
    const data=normalizeData(value),db=await openDb();
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,"readwrite");
      transaction.objectStore(STORE_NAME).put(data,DATA_KEY);
      transaction.oncomplete=resolve;
      transaction.onerror=()=>reject(transaction.error);
      transaction.onabort=()=>reject(transaction.error||new Error("保存被取消"));
    });
    db.close();
    return {ok:true,path:"本浏览器 IndexedDB"};
  };
  const safeName = value => String(value||"download").replace(/[\\/:*?"<>|]/g,"_");
  const downloadBlob = (blob,filename) => {
    const anchor=document.createElement("a"),url=URL.createObjectURL(blob);
    anchor.href=url;anchor.download=safeName(filename);anchor.style.display="none";
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    return anchor.download;
  };
  const downloadJson = (data,filename) => downloadBlob(new Blob([JSON.stringify(normalizeData(data),null,2)],{type:"application/json;charset=utf-8"}),filename);
  const chooseJson = () => new Promise((resolve,reject)=>{
    const input=document.createElement("input");input.type="file";input.accept=".json,application/json";input.style.display="none";
    input.onchange=async()=>{
      const file=input.files?.[0];input.remove();
      if(!file){resolve({canceled:true});return;}
      try{
        const raw=JSON.parse(await file.text());
        if(!raw||typeof raw!=="object"||!["customers","products","phones","adjustments"].every(key=>Array.isArray(raw[key])))throw new Error("格式无效");
        resolve({canceled:false,data:normalizeData(raw),source:file.name});
      }catch(error){reject(error);}
    };
    input.oncancel=()=>{input.remove();resolve({canceled:true});};
    document.body.appendChild(input);input.click();
  });

  const xml = value => String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const columnName = number => { let out="";for(;number>0;number=Math.floor((number-1)/26))out=String.fromCharCode(65+(number-1)%26)+out;return out; };
  const textWidth = value => [...String(value??"")].reduce((sum,character)=>sum+(character.codePointAt(0)>255?2:1),0);
  const worksheetXml = rows => {
    const columnCount=Math.max(1,...rows.map(row=>row.length));
    const columns=Array.from({length:columnCount},(_,columnIndex)=>{
      const width=Math.min(34,Math.max(12,...rows.map(row=>textWidth(row[columnIndex])+2)));
      return `<col min="${columnIndex+1}" max="${columnIndex+1}" width="${width}" customWidth="1"/>`;
    }).join("");
    const body=rows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,columnIndex)=>{
      const ref=`${columnName(columnIndex+1)}${rowIndex+1}`,style=rowIndex===0?' s="1"':"";
      return typeof value==="number"&&Number.isFinite(value)?`<c r="${ref}"${style}><v>${value}</v></c>`:`<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("")}</row>`).join("");
    const filter=rows.length?`<autoFilter ref="A1:${columnName(columnCount)}${rows.length}"/>`:"";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${body}</sheetData>${filter}</worksheet>`;
  };
  const crcTable=(()=>Array.from({length:256},(_,number)=>{let value=number;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;}))();
  const crc32 = bytes => {let current=0xffffffff;for(const byte of bytes)current=(current>>>8)^crcTable[(current^byte)&0xff];return (current^0xffffffff)>>>0;};
  const u16 = value => new Uint8Array([value&255,(value>>>8)&255]);
  const u32 = value => new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]);
  const concat = parts => {const length=parts.reduce((sum,part)=>sum+part.length,0),output=new Uint8Array(length);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}return output;};
  const makeXlsx = sheets => {
    const encoder=new TextEncoder(),files=[],add=(name,value)=>files.push({name:encoder.encode(name),data:encoder.encode(value)});
    add("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
    add("_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add("xl/workbook.xml",`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet,i)=>`<sheet name="${xml(sheet.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`);
    add("xl/_rels/workbook.xml.rels",`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    add("xl/styles.xml",'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2359D6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    sheets.forEach((sheet,i)=>add(`xl/worksheets/sheet${i+1}.xml`,worksheetXml(sheet.rows)));
    const locals=[],centrals=[];let offset=0;
    for(const file of files){
      const checksum=crc32(file.data),local=concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(checksum),u32(file.data.length),u32(file.data.length),u16(file.name.length),u16(0),file.name,file.data]);
      locals.push(local);
      centrals.push(concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(checksum),u32(file.data.length),u32(file.data.length),u16(file.name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),file.name]));
      offset+=local.length;
    }
    const central=concat(centrals),end=concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(central.length),u32(offset),u16(0)]);
    return new Blob([...locals,central,end],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  };

  window.inventoryDesktop={
    load:async()=>({data:await dbRead(),path:"本浏览器 IndexedDB"}),
    save:dbWrite,
    refocus:async()=>({ok:true}),
    backup:async value=>{const filename=`手机库存完整备份_${localDateKey()}.json`;downloadJson(value,filename);return{canceled:false,path:filename};},
    importData:chooseJson,
    saveMerged:async value=>{const before=await dbRead(),backupPath=`合并前完整备份_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;downloadJson(before,backupPath);await dbWrite(value);return{ok:true,backupPath};},
    reset:async value=>{const before=await dbRead(),backupPath=`重置前完整备份_${new Date().toISOString().replace(/[:.]/g,"-")}.json`;downloadJson(before,backupPath);await dbWrite(value);return{ok:true,data:normalizeData(value),backupPath,path:"本浏览器 IndexedDB"};},
    exportXlsx:async({filename,sheets})=>{downloadBlob(makeXlsx(sheets),filename);return{canceled:false,path:filename};}
  };

  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
})();
