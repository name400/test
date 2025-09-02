// ---------- helpers ----------
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];

let stream = null;
let shots = [];               // dataURL 배열 (최대 6)
let selected = new Set();     // 선택된 index 4개
let finalDataUrl = null;
let autoTimer = null, autoRunning = false;
let remain = 6, currentFacing = "user", currentDeviceId = null;

// ---------- 페이지 전환 ----------
const PAGES = { camera: "#pageCamera", select: "#pageSelect", edit: "#pageEdit" };
function showPage(name) {
  Object.values(PAGES).forEach(sel => $(sel).classList.remove("active"));
  $(PAGES[name]).classList.add("active");
  $$(".step").forEach(s => s.classList.toggle("active", s.dataset.step === name));
}

// ---------- 카메라 ----------
async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const sel = $("#cameraSelect");
  sel.innerHTML = "";
  devices.filter(d => d.kind === "videoinput").forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `카메라 ${i + 1}`;
    sel.appendChild(opt);
  });
  if (!currentDeviceId && sel.options.length > 0) currentDeviceId = sel.options[0].value;
  sel.value = currentDeviceId || "";
}
async function startCamera() {
  try {
    if (!location.protocol.startsWith("https")) {
      alert("카메라는 HTTPS에서만 동작합니다. GitHub Pages 주소(https://...)로 접속하세요.");
      return;
    }
    if (stream) stopCamera();
    const constraints = currentDeviceId
      ? { video: { deviceId: { exact: currentDeviceId } }, audio: false }
      : { video: { facingMode: currentFacing }, audio: false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = $("#video");
    video.srcObject = stream;
    video.onloadedmetadata = () => video.play();
    $("#btnShot").disabled = false;
  } catch (e) {
    alert("카메라 접근 실패: " + e.message);
  }
}
function stopCamera() {
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
}

// ---------- 촬영 ----------
function triggerFlash() {
  const f = $("#flash");
  f.classList.add("active");
  setTimeout(() => f.classList.remove("active"), 250);
}
function updateCountdownUI(t) {
  $("#countdown").textContent = t;
}

async function startAutoCapture() {
  shots = [];
  selected.clear();
  finalDataUrl = null;
  renderThumbs();
  renderPreview();
  updateCounter();
  toggleNextButtons();

  autoRunning = true;
  remain = 6;
  if (autoTimer) clearInterval(autoTimer);

  updateCountdownUI(remain);
  autoTimer = setInterval(() => {
    if (!autoRunning) {
      clearInterval(autoTimer);
      updateCountdownUI("");
      return;
    }
    remain--;
    updateCountdownUI(remain > 0 ? remain : "");
    if (remain <= 0) {
      triggerFlash();
      doCapture();
      remain = 6;
      if (shots.length >= 6) {
        autoRunning = false;
        clearInterval(autoTimer);
        updateCountdownUI("");
        toggleNextButtons();
        showPage("select"); // 자동 이동
      }
    }
  }, 1000);
}
function doCapture() {
  const video = $("#video");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  if (shots.length < 6) {
    shots.push(dataUrl);
    renderThumbs();
    updateCounter();
    toggleNextButtons();
  }
}
function updateCounter() {
  $("#shotCounter").textContent = `${shots.length} / 6`;
}

// ---------- 선택 & 미리보기 ----------
function renderThumbs() {
  const grid = $("#thumbGrid");
  grid.innerHTML = "";
  shots.forEach((src, idx) => {
    const d = document.createElement("div");
    d.className = "thumb" + (selected.has(idx) ? " sel" : "");
    d.innerHTML = `<img src="${src}" alt="shot ${idx + 1}">`;
    d.onclick = () => {
      if (selected.has(idx)) selected.delete(idx);
      else if (selected.size < 4) selected.add(idx);
      renderThumbs();
      renderPreview();
      toggleNextButtons();
    };
    grid.appendChild(d);
  });
}
function renderPreview() {
  const grid = $("#finalGrid");
  if (!grid) return;
  grid.innerHTML = "";
  [...selected].forEach(i => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.innerHTML = `<img src="${shots[i]}" alt="selected ${i + 1}">`;
    grid.appendChild(cell);
  });
}
function toggleNextButtons() {
  $("#toSelect").disabled = shots.length < 6;
  const ok4 = (selected.size === 4);
  $("#toEdit").disabled = !ok4;
  const btnMake = $("#btnMake");
  if (btnMake) btnMake.disabled = !ok4;
}

// ---------- 고해상도 합성 유틸 ----------
function parseResSel() {
  const v = ($("#resSel")?.value || "2400x3600").split("x");
  return { W: parseInt(v[0], 10), H: parseInt(v[1], 10) }; // 2:3 비율
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}
function drawFrameBackground(ctx, W, H, style, color) {
  if (style === "polaroid" || style === "solid") {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
  } else if (style === "gradientLight") {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, color);
    g.addColorStop(1, "#ffffff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else { // gradientDark
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, color);
    g.addColorStop(1, "#000000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
function layoutFourcutRect(W, H, style) {
  const outerPad = Math.round(Math.min(W, H) * 0.05);
  const bottomExtra = (style === "polaroid") ? Math.round(H * 0.06) : 0;
  const gap = Math.round(Math.min(W, H) * 0.02);

  const innerX = outerPad;
  const innerY = outerPad;
  const innerW = W - outerPad * 2;
  const innerH = H - outerPad * 2 - bottomExtra;

  const cellW = Math.round((innerW - gap) / 2);
  const cellH = Math.round((innerH - gap) / 2);

  return {
    grid: [
      { x: innerX,               y: innerY,               w: cellW, h: cellH },
      { x: innerX + cellW + gap, y: innerY,               w: cellW, h: cellH },
      { x: innerX,               y: innerY + cellH + gap, w: cellW, h: cellH },
      { x: innerX + cellW + gap, y: innerY + cellH + gap, w: cellW, h: cellH },
    ],
    captionArea: bottomExtra ? { x: outerPad, y: H - outerPad - bottomExtra, w: innerW, h: bottomExtra } : null
  };
}
function drawCover(ctx, img, x, y, w, h) {
  const rImg = img.width / img.height;
  const rBox = w / h;
  let sx, sy, sw, sh;
  if (rImg > rBox) { sh = img.height; sw = sh * rBox; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / rBox; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
async function drawHeader(ctx, W, H, fontColor) {
  try {
    const logoEl = document.querySelector(".fc-logo");
    if (logoEl) {
      let src = logoEl.src;
      if (!src.startsWith("data:")) {
        const r = await fetch(src, { mode: "cors" });
        const b = await r.blob();
        src = await new Promise(ok => {
          const fr = new FileReader();
          fr.onload = () => ok(fr.result);
          fr.readAsDataURL(b);
        });
      }
      const logo = await loadImage(src);
      const logoSize = Math.round(Math.min(W, H) * 0.06);
      const lx = Math.round(W * 0.5 - logoSize - 8);
      const ly = Math.round(H * 0.05);
      ctx.drawImage(logo, lx, ly, logoSize, logoSize);
    }
  } catch {}

  // 타이틀(벡터 텍스트)
  ctx.fillStyle = fontColor || "#111";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(Math.min(W,H)*0.045)}px 'Noto Sans KR', system-ui, sans-serif`;
  const text = document.querySelector(".fc-title")?.textContent || "2025 보성제";
  const tx = Math.round(W * 0.5 + 8);
  const ty = Math.round(H * 0.05 + Math.min(W,H) * 0.03);
  ctx.fillText(text, tx, ty);
}

// ---------- 프레임/글씨 색상 ----------
function hexToRgb(hex){const m=hex.replace('#','');const b=parseInt(m,16);if(m.length===3){const r=(b>>8)&0xF,g=(b>>4)&0^0,l=b&0xF;return{r:r*17,g:g*17,b:l*17};}return{r:(b>>16)&255,g:(b>>8)&255,b:b&255};}
function rgbToHex({r,g,b}){const h=n=>n.toString(16).padStart(2,'0');return`#${h(r)}${h(g)}${h(b)}`;}
function mix(a,b,t){a=hexToRgb(a);b=hexToRgb(b);return rgbToHex({r:Math.round(a.r+(b.r-a.r)*t),g:Math.round(a.g+(b.g-a.g)*t),b:Math.round(a.b+(b.b-a.b)*t)});}
function updateFrame(){
  const s = $("#frameStyle").value,
        c = $("#frameColor").value,
        f = $("#fourcut");
  if (s === "polaroid"){ f.className = "fourcut polaroid"; f.style.background = c; }
  else if (s === "solid"){ f.className = "fourcut solid"; f.style.background = c; }
  else if (s === "gradientLight"){ f.className="fourcut gradient"; f.style.background=`linear-gradient(135deg, ${c} 0%, ${mix(c,"#fff",0.7)} 100%)`; }
  else { f.className="fourcut gradient"; f.style.background=`linear-gradient(135deg, ${c} 0%, ${mix(c,"#000",0.5)} 100%)`; }
}
function updateFontColor(){
  const c = $("#fontColor").value;
  $(".fc-title").style.color = c;
}

// ---------- 합성(고정 해상도로 직접 그리기) ----------
async function makeFourcut() {
  if (selected.size !== 4) return alert("4장을 선택하세요");

  // 목표 해상도/품질
  const { W, H } = parseResSel();
  const quality = Math.max(0.5, Math.min(parseFloat($("#jpgQ")?.value || "0.92"), 0.98));

  // 캔버스
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 배경(프레임)
  const style = $("#frameStyle").value;
  const frameColor = $("#frameColor").value;
  drawFrameBackground(ctx, W, H, style, frameColor);

  // 그리드
  const { grid } = layoutFourcutRect(W, H, style);

  // 선택된 4장 로드 & 배치
  const order = [...selected];
  const imgs = await Promise.all(order.map(i => loadImage(shots[i])));
  imgs.forEach((im, idx) => {
    const r = grid[idx];
    const pad = Math.round(Math.min(W,H) * 0.005);
    ctx.fillStyle = "#eee";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawCover(ctx, im, r.x + pad, r.y + pad, r.w - pad*2, r.h - pad*2);
  });

  // 헤더(로고 + 타이틀)
  await drawHeader(ctx, W, H, $("#fontColor").value);

  // dataURL 생성
  finalDataUrl = canvas.toDataURL("image/jpeg", quality);
  $("#btnSave").disabled = false;
}

// ---------- 저장 & 갤러리 & QR ----------
const CLOUD_NAME = 'djqkuxfki', UPLOAD_PRESET = 'fourcut_unsigned';

function setQrState({loading=false, error=""} = {}) {
  const l = $("#qrLoading"), e = $("#qrError");
  if (l) l.style.display = loading ? "block" : "none";
  if (e) { e.style.display = error ? "block" : "none"; e.textContent = error || ""; }
}
function computeQrPopupSize(){ return Math.max(160, Math.floor(Math.min(window.innerWidth * 0.6, 260))); }
function openQrPopup(url){
  const p=$("#qrPopup"), w=$("#qrPopupContainer");
  w.innerHTML="";
  new QRCode(w,{text:url,width:computeQrPopupSize(),height:computeQrPopupSize(),correctLevel:QRCode.CorrectLevel.M});
  p.style.display='flex';
}
function closeQrPopup(){ resetSession(); $("#qrPopup").style.display='none'; showPage('camera'); }

async function uploadFinalToCloudinary(){
  const blob = await (await fetch(finalDataUrl)).blob();
  if (blob.size > 10 * 1024 * 1024) throw new Error(`이미지가 너무 큽니다 (${(blob.size/1024/1024).toFixed(1)}MB).`);
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method:'POST', body: form, mode: 'cors', credentials: 'omit', cache: 'no-store'
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> "");
    throw new Error(`업로드 실패(${res.status}). ${txt?.slice(0,120)}`);
  }
  const data = await res.json();
  if (!data.secure_url) throw new Error("업로드 응답에 secure_url이 없습니다.");
  return data.secure_url;
}
function makeViewerUrl(u){
  const v = new URL('viewer.html', location.href);
  v.searchParams.set('img', u);
  return v.toString();
}
async function showQrPopupWithUpload(){
  setQrState({loading:true, error:""});
  $("#qrPopup").style.display='flex';
  $("#qrPopupContainer").innerHTML = "";
  try{
    const url = await uploadFinalToCloudinary();
    setQrState({loading:false});
    openQrPopup(makeViewerUrl(url));
  }catch(err){
    console.error(err);
    setQrState({loading:false, error: "QR 생성 실패: " + err.message});
    const w = $("#qrPopupContainer");
    const retry = document.createElement("button");
    retry.textContent = "다시 시도";
    retry.className = "ghost";
    retry.onclick = () => { setQrState({loading:true, error:""}); showQrPopupWithUpload(); };
    w.innerHTML = "";
    w.appendChild(retry);
  }
}

async function saveImage() {
  if (!finalDataUrl) return;
  const id = Date.now();
  localStorage.setItem("photo:" + id, JSON.stringify({ id, createdAt: Date.now(), image: finalDataUrl }));
  await renderGallery();
  await showQrPopupWithUpload();
}
function resetSession() {
  shots = []; selected.clear(); finalDataUrl = null;
  renderThumbs(); renderPreview(); updateCounter();
  $("#btnSave").disabled = true; $("#btnMake").disabled = true; toggleNextButtons();
}
async function renderGallery() {
  const grid = $("#galleryGrid");
  grid.innerHTML = "";
  const items = Object.keys(localStorage)
    .filter(k => k.startsWith("photo:"))
    .map(k => JSON.parse(localStorage.getItem(k)))
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!items.length) {
    grid.innerHTML = "<div style='grid-column:1/-1;text-align:center;color:#999'>저장된 사진 없음</div>";
    return;
  }
  for (const it of items) {
    const wrap = document.createElement("div");
    wrap.className = "g-item";
    wrap.innerHTML = `<img src="${it.image}" alt=""><button class="del">×</button>`;
    wrap.querySelector(".del").onclick = () => { localStorage.removeItem("photo:" + it.id); renderGallery(); };
    grid.appendChild(wrap);
  }
}

// ---------- 이벤트 ----------
document.addEventListener("DOMContentLoaded", async () => {
  await listCameras();

  // 페이지 이동
  $("#toSelect").onclick = () => showPage("select");
  $("#toEdit").onclick = () => { renderPreview(); showPage("edit"); };
  $("#backToCamera").onclick = () => showPage("camera");
  $("#backToSelect").onclick = () => showPage("select");

  // 카메라
  $("#cameraSelect").onchange = () => { currentDeviceId = $("#cameraSelect").value; };
  $("#btnStart").onclick = async () => { await startCamera(); startAutoCapture(); };
  $("#btnShot").onclick  = () => { triggerFlash(); doCapture(); if (autoRunning){ remain = 6; updateCountdownUI(remain); } };
  $("#btnReset").onclick = () => resetSession();
  $("#btnFlip").onclick  = async () => {
    currentFacing = (currentFacing === "user") ? "environment" : "user";
    currentDeviceId = null;
    await startCamera();
  };

  // 편집/저장
  $("#frameStyle").oninput = updateFrame;
  $("#frameColor").oninput = updateFrame;
  $("#fontColor").oninput  = updateFontColor;
  $("#btnMake").onclick    = makeFourcut;
  $("#btnSave").onclick    = saveImage;

  // 갤러리
  $("#btnGallery").onclick = async () => {
    const pass = prompt("갤러리 암호 입력:");
    if (pass === "posungprogramming") {
      await renderGallery();
      $("#gallery").hidden = false;
      $("#gallery").classList.add("open");
      $("#backdrop").hidden = false;
    } else if (pass !== null) alert("암호가 틀렸습니다.");
  };
  $("#btnCloseGallery").onclick = () => {
    $("#gallery").classList.remove("open");
    setTimeout(() => $("#gallery").hidden = true, 250);
    $("#backdrop").hidden = true;
  };
  $("#btnWipeGallery").onclick = () => {
    if (confirm("모두 삭제?")) {
      Object.keys(localStorage).filter(k => k.startsWith("photo:")).forEach(k => localStorage.removeItem(k));
      renderGallery();
    }
  };
  $("#backdrop").onclick = () => {
    $("#gallery").classList.remove("open");
    setTimeout(() => $("#gallery").hidden = true, 250);
    $("#backdrop").hidden = true;
  };

  // 초기 상태
  updateFrame();
  updateFontColor();
  toggleNextButtons();
});
