"use strict";

(() => {
  const manualInputIds=["inboundCode","boxNumber","outboundCode","newCustomer","pUpc","pModel","pColor","pCapacity","adjustQuantity","adjustNote"];
  const eligibleSelector=manualInputIds.map(id=>`#${id}`).join(",");
  const numericIds=new Set(["pUpc","adjustQuantity"]);
  const enterIds=new Set(["inboundCode","boxNumber","outboundCode","newCustomer"]);
  const nextIds=new Set(["inboundCode","boxNumber"]);
  let activeInput=null;
  let caret=0;
  let layout="letters";
  let shifted=true;

  const keyboard=document.createElement("section");
  keyboard.id="iosVirtualKeyboard";
  keyboard.className="ios-keyboard";
  keyboard.hidden=true;
  keyboard.setAttribute("aria-label","软件内置虚拟键盘");
  keyboard.innerHTML='<div class="ios-keyboard-toolbar"><strong id="iosKeyboardLabel">手动输入</strong><button id="iosKeyboardDone" type="button">完成</button></div><div id="iosKeyboardKeys" class="ios-keyboard-keys"></div>';
  document.body.appendChild(keyboard);
  const label=keyboard.querySelector("#iosKeyboardLabel");
  const toolbarDone=keyboard.querySelector("#iosKeyboardDone");
  const keys=keyboard.querySelector("#iosKeyboardKeys");

  function syncKeyboardToViewport(){
    const compact=window.matchMedia("(pointer:coarse), (max-width:850px)").matches;
    const viewport=window.visualViewport;
    if(compact&&viewport){
      keyboard.style.left=`${viewport.offsetLeft}px`;
      keyboard.style.width=`${viewport.width}px`;
      keyboard.style.maxWidth="none";
      keyboard.style.transform="none";
    }else{
      keyboard.style.left="";
      keyboard.style.width="";
      keyboard.style.maxWidth="";
      keyboard.style.transform="";
    }
  }

  function fieldLabel(input){
    const explicit=input.closest("label")?.querySelector(":scope > b")?.textContent||input.closest("label")?.childNodes?.[0]?.textContent||input.placeholder||"手动输入";
    return String(explicit).trim().replace(/\s+/g," ")||"手动输入";
  }

  function isNumeric(input){
    return input.type==="number"||input.inputMode==="numeric"||numericIds.has(input.id);
  }

  function actionLabel(input){
    if(nextIds.has(input.id))return "下一项";
    if(enterIds.has(input.id))return "确认";
    return "完成";
  }

  function createKey(text,options={}){
    const button=document.createElement("button");
    button.type="button";button.className="ios-keyboard-key";
    if(options.className)button.classList.add(...options.className.split(" "));
    button.textContent=text;button.dataset.key=options.key??text;
    button.setAttribute("aria-label",options.label||text);
    return button;
  }

  function addRow(items){
    const row=document.createElement("div");row.className="ios-keyboard-row";
    for(const item of items)row.appendChild(typeof item==="string"?createKey(item):createKey(item.text,item));
    keys.appendChild(row);
  }

  function renderLetters(){
    keyboard.classList.remove("numeric");keys.innerHTML="";
    const transform=value=>shifted?value.toUpperCase():value.toLowerCase();
    addRow([..."qwertyuiop"].map(transform));
    addRow([..."asdfghjkl"].map(transform));
    addRow([{text:"⇧",key:"shift",label:"切换大小写",className:`special wide${shifted?" shift-active":""}`},...[..."zxcvbnm"].map(transform),{text:"⌫",key:"backspace",label:"删除",className:"special wide"}]);
    addRow([{text:"123",key:"symbols",className:"special wide"},{text:"空格",key:"space",className:"space"},{text:actionLabel(activeInput),key:"action",className:"action wide"}]);
  }

  function renderSymbols(){
    keyboard.classList.remove("numeric");keys.innerHTML="";
    addRow([..."1234567890"]);
    addRow(["-","/",":",";","(",")","$","&","@",'\"']);
    addRow([{text:"#+=",key:"more",className:"special wide"},".",",","?","!","'",{text:"⌫",key:"backspace",label:"删除",className:"special wide"}]);
    addRow([{text:"ABC",key:"letters",className:"special wide"},{text:"空格",key:"space",className:"space"},{text:actionLabel(activeInput),key:"action",className:"action wide"}]);
  }

  function renderMoreSymbols(){
    keyboard.classList.remove("numeric");keys.innerHTML="";
    addRow(["[","]","{","}","#","%","^","*","+","="]);
    addRow(["_","\\","|","~","<",">","€","£","¥","•"]);
    addRow([{text:"123",key:"symbols",className:"special wide"},".",",","?","!","'",{text:"⌫",key:"backspace",label:"删除",className:"special wide"}]);
    addRow([{text:"ABC",key:"letters",className:"special wide"},{text:"空格",key:"space",className:"space"},{text:actionLabel(activeInput),key:"action",className:"action wide"}]);
  }

  function renderNumeric(){
    keyboard.classList.add("numeric");keys.innerHTML="";
    addRow(["1","2","3"]);addRow(["4","5","6"]);addRow(["7","8","9"]);
    addRow([{text:"清除",key:"clear",className:"special"},"0",{text:"⌫",key:"backspace",label:"删除",className:"special"}]);
  }

  function render(){
    if(!activeInput)return;
    label.textContent=fieldLabel(activeInput);
    toolbarDone.textContent=actionLabel(activeInput);
    if(layout==="numeric")renderNumeric();
    else if(layout==="symbols")renderSymbols();
    else if(layout==="more")renderMoreSymbols();
    else renderLetters();
  }

  function replaceSelection(text){
    if(!activeInput)return;
    const value=String(activeInput.value||""),start=Math.max(0,Math.min(caret,value.length));
    const end=Math.max(start,Math.min(activeInput.selectionEnd??start,value.length));
    activeInput.value=value.slice(0,start)+text+value.slice(end);
    caret=start+text.length;
    try{activeInput.setSelectionRange(caret,caret);}catch{}
    activeInput.dispatchEvent(new Event("input",{bubbles:true}));
  }

  function backspace(){
    if(!activeInput)return;
    const value=String(activeInput.value||""),end=activeInput.selectionEnd??caret,start=activeInput.selectionStart??caret;
    if(end>start){activeInput.value=value.slice(0,start)+value.slice(end);caret=start;}
    else if(caret>0){activeInput.value=value.slice(0,caret-1)+value.slice(caret);caret-=1;}
    try{activeInput.setSelectionRange(caret,caret);}catch{}
    activeInput.dispatchEvent(new Event("input",{bubbles:true}));
  }

  function closeKeyboard(){
    if(activeInput){activeInput.classList.remove("keyboard-active");activeInput.dispatchEvent(new Event("change",{bubbles:true}));}
    keyboard.hidden=true;document.body.classList.remove("keyboard-open");activeInput=null;
  }

  function pressAction(){
    const input=activeInput;if(!input)return;
    const shouldEnter=enterIds.has(input.id);
    closeKeyboard();
    if(shouldEnter){
      input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true,cancelable:true}));
      if(nextIds.has(input.id))setTimeout(()=>{
        const next=document.activeElement;
        if(next instanceof HTMLInputElement&&next.matches(eligibleSelector))openKeyboard(next);
      },100);
    }
  }

  function openKeyboard(input){
    if(!input||input.disabled||(input.readOnly&&input.dataset.virtualKeyboardInstalled!=="true"))return;
    if(activeInput===input&&!keyboard.hidden)return;
    if(activeInput)activeInput.classList.remove("keyboard-active");
    activeInput=input;caret=input.selectionStart??String(input.value||"").length;
    layout=isNumeric(input)?"numeric":"letters";shifted=!input.value;
    input.classList.add("keyboard-active");
    syncKeyboardToViewport();keyboard.hidden=false;document.body.classList.add("keyboard-open");render();
    setTimeout(()=>input.scrollIntoView({behavior:"smooth",block:"center"}),30);
  }

  function installManualInputs(){
    document.querySelectorAll(eligibleSelector).forEach(input=>{
      if(input.dataset.virtualKeyboardInstalled)return;
      input.dataset.virtualKeyboardInstalled="true";
      input.setAttribute("inputmode","none");
      input.readOnly=true;
      input.setAttribute("aria-description","使用软件内置键盘输入");
      input.addEventListener("focus",()=>openKeyboard(input));
      input.addEventListener("click",()=>openKeyboard(input));
    });
  }

  keys.addEventListener("click",event=>{
    const button=event.target.closest("button[data-key]");if(!button||!activeInput)return;
    const key=button.dataset.key;
    if(key==="backspace")backspace();
    else if(key==="clear"){activeInput.value="";caret=0;activeInput.dispatchEvent(new Event("input",{bubbles:true}));}
    else if(key==="shift"){shifted=!shifted;render();}
    else if(key==="symbols"){layout="symbols";render();}
    else if(key==="more"){layout="more";render();}
    else if(key==="letters"){layout="letters";render();}
    else if(key==="space")replaceSelection(" ");
    else if(key==="action")pressAction();
    else{replaceSelection(key);if(layout==="letters"&&shifted){shifted=false;render();}}
  });
  keyboard.addEventListener("pointerdown",event=>{if(event.target.closest("button"))event.preventDefault();});
  window.addEventListener("resize",syncKeyboardToViewport);
  window.visualViewport?.addEventListener("resize",syncKeyboardToViewport);
  window.visualViewport?.addEventListener("scroll",syncKeyboardToViewport);
  toolbarDone.addEventListener("click",pressAction);
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!keyboard.hidden)closeKeyboard();});
  document.addEventListener("pointerdown",event=>{
    if(keyboard.hidden||keyboard.contains(event.target)||event.target.closest(eligibleSelector))return;
    closeKeyboard();
  });
  installManualInputs();
})();
