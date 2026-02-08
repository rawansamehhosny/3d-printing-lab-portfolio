import { Hono } from 'hono'
import { serveStatic } from 'hono/bun' 
import { writeFile, mkdir } from 'node:fs/promises'
import { cors } from "hono/cors";
const app = new Hono();
import 'dotenv/config'; 
app.use("*", cors());
import { Model } from './models/model'; 
import mongoose from 'mongoose';
app.use('/uploads/*', serveStatic({ root: './public' }));
import { createClient } from '@supabase/supabase-js'

// إعداد عميل Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);
// import { v2 as cloudinary } from 'cloudinary';

// إعدادات الربط مع Cloudinary
// cloudinary.config({ 
//   cloud_name: process.env.CLOUDINARY_NAME, 
//   api_key: process.env.CLOUDINARY_KEY, 
//   api_secret: process.env.CLOUDINARY_SECRET 
// });

const mongoURI = process.env.MONGO_URI;
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
app.get("static/*", serveStatic({ root: "./public" }));
if (!mongoURI) { 
  console.error("❌ Error: MONGO_URI is not defined in .env file");
} else {
  mongoose.connect(mongoURI)
    .then(() => console.log("🚀 Connected to MongoDB successfully!"))
    .catch((err) => {
      console.error(err);
    //   // لو الـ Cloud فشل بسبب الـ DNS في مصر، هيحاول يربط بالمحلي اللي نزلتيه
    //   mongoose.connect("mongodb://127.0.0.1:27017/3d_database")
    //     .then(() => console.log("🏠 Local MongoDB Connected!"))
    //     .catch(localErr => console.error("❌ All connections failed:", localErr.message));
    
    });
}
app.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const files = formData.getAll('modelFiles');
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;

    if (!files || files.length === 0) return c.json({ error: "No files selected" }, 400);

    let model3dUrl = "";
    const imageUrls: string[] = [];

    // 2. اللوب لرفع الملفات لسوبابيس
    for (const fileValue of files) {
      const file = fileValue as File;
      if (file.size > 0) {
       const safeFileName = file.name.replace(/[^\x00-\x7F]/g, "file"); 
        
        // 2. بنعمل المسار النهائي (الوقت + الاسم النظيف)
        const filePath = `${Date.now()}_${safeFileName}`;
        
        // 3. بنرفع لـ Supabase باستخدام الـ filePath الجديد
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('3d-printing-lab') 
          .upload(filePath, file);

        if (uploadError) {
          console.error("Supabase Upload Error:", uploadError.message);
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // 4. بنجيب اللينك برضه باستخدام الـ filePath الجديد
        const { data: { publicUrl } } = supabase.storage
          .from('3d-printing-lab')
          .getPublicUrl(filePath);

        // ... باقي الكود اللي بيصنف الملف (image أو model) ...
        const lowerName = safeFileName.toLowerCase(); // استخدمي الاسم النظيف هنا برضه
        if (lowerName.endsWith('.glb') || lowerName.endsWith('.gltf')) {
          model3dUrl = publicUrl;
        } else {
          imageUrls.push(publicUrl);
        }
      }
    }

    // 4. الحفظ في MongoDB Atlas (اللي إحنا لسه مصلحينه!)
    const newModel = await Model.create({
      title: title || "New Asset",
      description: description || "",
      images: imageUrls,
      model3d: model3dUrl 
    });

    return c.json({ success: true, url: model3dUrl, data: newModel });

  } catch (error: any) {
    console.error("❌ Supabase Route Error:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.get('/admin', (c) => {
  const auth = getCookie(c, 'admin_session');
  if (auth !== 'verified_ahmed') return c.redirect('/login-secure');

  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Laboratory | 3D printing Lab</title>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg: #050505;
          --accent: #c5a358;
          --glass: rgba(255, 255, 255, 0.02);
          --border: rgba(255, 255, 255, 0.07);
        }

        * { box-sizing: border-box; } /* الحل السحري لمشكلة الـ Inputs الخارجة لبره */

        body { 
          font-family: 'Inter', sans-serif; 
          background: radial-gradient(circle at top right, #1a1a1d, #050505);
          color: #fff; 
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          overflow: hidden;
        }

        .admin-card { 
          background: var(--glass); 
          backdrop-filter: blur(25px);
          padding: 50px; 
          border: 1px solid var(--border);
          width: 100%;
          max-width: 550px; /* ظبطت العرض عشان يكون مريح للعين */
          position: relative;
          box-shadow: 0 50px 100px rgba(0,0,0,0.5);
        }

        /* البرواز الجمالي */
        .admin-card::before {
          content: ''; position: absolute; top: -1px; left: -1px; width: 40px; height: 40px;
          border-top: 2px solid var(--accent); border-left: 2px solid var(--accent);
        }

        h2 { 
          font-family: 'Playfair Display', serif;
          font-size: 2.8rem;
          margin: 0 0 5px 0;
          letter-spacing: 1px;
        }

        .subtitle {
          color: var(--accent);
          font-size: 0.7rem;
          letter-spacing: 4px;
          text-transform: uppercase;
          margin-bottom: 40px;
          display: block;
          opacity: 0.8;
        }

        .input-group { margin-bottom: 20px; width: 100%; }

        input[type="text"], textarea {
          width: 100%;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border);
          border-left: 2px solid transparent;
          padding: 15px 20px;
          color: white;
          font-family: 'Inter', sans-serif;
          transition: 0.4s;
          outline: none;
        }

        input:focus, textarea:focus {
          border-left-color: var(--accent);
          background: rgba(255,255,255,0.05);
        }

        textarea { height: 100px; resize: none; }

        .file-upload {
          border: 1px dashed var(--border);
          padding: 35px;
          margin: 25px 0;
          text-align: center;
          transition: 0.3s;
          cursor: pointer;
          background: rgba(255,255,255,0.01);
        }

        .file-upload:hover { border-color: var(--accent); background: rgba(197, 163, 88, 0.05); }

        /* --- Progress Bar Style --- */
        .progress-container {
          width: 100%;
          height: 2px;
          background: var(--border);
          margin: 20px 0;
          display: none; /* بيظهر بس وقت الرفع */
          position: relative;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background: var(--accent);
          width: 0%;
          transition: width 0.4s ease;
          box-shadow: 0 0 10px var(--accent);
        }

        button { 
          background: none;
          border: 1px solid var(--accent);
          color: var(--accent);
          padding: 20px;
          width: 100%;
          text-transform: uppercase;
          letter-spacing: 3px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: 0.4s;
        }

        button:hover:not(:disabled) { 
          background: var(--accent); 
          color: black; 
        }

        button:disabled { opacity: 0.3; cursor: not-allowed; border-color: #555; color: #555; }

        .back-home {
          position: absolute; top: 40px; left: 40px;
          color: white; text-decoration: none; font-size: 0.65rem;
          letter-spacing: 2px; opacity: 0.4; transition: 0.3s;
        }
        .back-home:hover { opacity: 1; color: var(--accent); }

        #result { 
          margin-top: 15px; 
          font-size: 0.65rem; 
          text-align: center;
          letter-spacing: 2px; 
          text-transform: uppercase; 
        }
      </style>
    </head>
    <body>
      <a href="/gallery" class="back-home">← TERMINAL_HOME</a>

      <div class="admin-card">
        <h2>Laboratory</h2>
        <span class="subtitle">Secure Asset Deployment</span>
        
        <form id="uploadForm">
          <div class="input-group">
            <input type="text" id="modelTitle" name="title" placeholder="ASSET_NAME" required />
          </div>

          <div class="input-group">
            <textarea id="modelDesc" name="description" placeholder="ASSET_STORY / TECHNICAL_SPECS"></textarea>
          </div>
          
          <div class="file-upload" onclick="document.getElementById('modelFiles').click()">
            <span id="file-label" style="font-size: 0.65rem; opacity: 0.5; letter-spacing: 2px;">
                UPLOAD_MANIFEST: SELECT 3D & IMAGES
            </span>
            <input type="file" id="modelFiles" name="modelFiles" multiple accept="image/*,.glb,.gltf" style="display:none" required 
                   onchange="updateFileLabel(this)"/>
          </div>

          <div class="progress-container" id="progCont">
            <div class="progress-bar" id="progBar"></div>
          </div>
          
          <button type="submit" id="submitBtn">Initialize_Deployment</button>
        </form>
        
        <div id="result"></div>
      </div>
      
      <script>
        function updateFileLabel(input) {
            const label = document.getElementById('file-label');
            label.innerText = input.files.length + ' ASSETS_STAGED';
            label.style.color = 'var(--accent)';
        }

        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const resultDiv = document.getElementById('result');
          const submitBtn = document.getElementById('submitBtn');
          const progCont = document.getElementById('progCont');
          const progBar = document.getElementById('progBar');
          
          const formData = new FormData();
          const files = document.getElementById('modelFiles').files;
          
          formData.append('title', document.getElementById('modelTitle').value);
          formData.append('description', document.getElementById('modelDesc').value);
          for (let i = 0; i < files.length; i++) {
            formData.append('modelFiles', files[i]);
          }

          // تشغيل الـ Progress Bar بشكل وهمي (Simulated) عشان يدي إحساس بالرفع
          submitBtn.disabled = true;
          progCont.style.display = 'block';
          resultDiv.innerHTML = '⚡ ESTABLISHING UPLINK...';
          resultDiv.style.color = 'white';

          let progress = 0;
          const interval = setInterval(() => {
            if (progress < 90) {
                progress += Math.random() * 15;
                progBar.style.width = Math.min(progress, 90) + '%';
            }
          }, 400);

          try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            if (response.ok) {
              clearInterval(interval);
              progBar.style.width = '100%';
              resultDiv.innerHTML = "✅ DEPLOYMENT_COMPLETE";
              resultDiv.style.color = 'var(--accent)';
              setTimeout(() => {
                document.getElementById('uploadForm').reset();
                progCont.style.display = 'none';
                progBar.style.width = '0%';
                document.getElementById('file-label').innerText = "UPLOAD_MANIFEST: SELECT 3D & IMAGES";
              }, 2000);
            } else {
              throw new Error();
            }
          } catch (error) {
            clearInterval(interval);
            progCont.style.display = 'none';
            resultDiv.innerHTML = "❌ UPLINK_FAILED";
            resultDiv.style.color = '#ff4757';
          } finally {
            submitBtn.disabled = false;
          }
        });
      </script>
    </body>
    </html>
  `);
});

app.get('/gallery', async (c) => {
  const models = await Model.find({});

  const cardsHtml = models.map(m => `
    <div class="card" onclick="location.href='/model/${m._id}'">
      <div class="card-image-wrapper">
        <img src="${m.images[0]}" class="card-img" alt="${m.title}" loading="lazy">
        <div class="card-overlay">
          <span>Explore Asset</span>
        </div>
      </div>
      <div class="card-info">
        <p class="card-category">3D PREMIUM ASSET</p>
        <h3>${m.title}</h3>
        <div class="card-footer">
          <span class="view-link">View Details</span>
          <span class="arrow">→</span>
        </div>
      </div>
    </div>
  `).join('');

  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AHMED.3D | Private Gallery</title>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
      <style>
        :root { 
          --bg: #050505; 
          --accent: #c5a358; 
          --text-muted: #666666;
        }

        body { 
          font-family: 'Inter', sans-serif; 
          background: radial-gradient(circle at top right, #1a1a1d, #050505);
          color: white; 
          margin: 0; 
          overflow-x: hidden;
          scroll-behavior: smooth;
          -webkit-font-smoothing: antialiased;
        }

        nav { 
          padding: 30px 60px; 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          background: rgba(5, 5, 5, 0.8);
          backdrop-filter: blur(20px);
          position: sticky; top: 0; z-index: 1000;
        }
        .logo { font-family: 'Playfair Display', serif; font-size: 1.8rem; letter-spacing: 2px; color: var(--accent); }
        nav a { color: white; text-decoration: none; font-size: 0.75rem; letter-spacing: 2px; text-transform: uppercase; margin-left: 30px; opacity: 0.6; transition: 0.3s; }
        nav a:hover { opacity: 1; color: var(--accent); }

        .container { max-width: 1400px; margin: 60px auto; padding: 0 50px; }
        h1 { font-family: 'Playfair Display', serif; font-size: 4rem; margin-bottom: 60px; font-weight: 700; line-height: 1; color: #fff; }

        .grid { 
          display: grid; 
          /* تم تعديل الـ minmax لضمان ثبات العرض ومنع التمدد */
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); 
          gap: 40px; 
        }

        .card { 
          background: rgba(255, 255, 255, 0.02); 
          backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          cursor: pointer;
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          will-change: transform;
          /* التعديل: إجبار الكارت على الالتزام بالعرض المخصص له في الـ Grid */
          display: flex;
          flex-direction: column;
          overflow: hidden; 
        }

        .card:hover {
          transform: translateY(-12px);
          border-color: rgba(197, 163, 88, 0.4);
          box-shadow: 0 20px 40px rgba(0,0,0,0.6);
          background: rgba(255, 255, 255, 0.04);
        }

        .card-image-wrapper {
          position: relative;
          width: 100%;
          height: 320px;
          overflow: hidden;
          transform: translateZ(0);
        }

        .card-img { 
          width: 100%; 
          height: 100%; 
          /* دي اللي بتخلي الصورة تتقص باحترافية بدل ما تتمط */
          object-fit: cover; 
          transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
          filter: grayscale(0.4);
          will-change: transform, filter;
        }

        .card:hover .card-img { transform: scale(1.1); filter: grayscale(0); }

        .card-info { padding: 30px 25px; flex-grow: 1; }
        .card-category { font-size: 0.65rem; color: var(--accent); letter-spacing: 3px; margin-bottom: 12px; opacity: 0.8; }
        
        .card-info h3 { 
          font-size: 1.5rem; margin: 0; 
          font-family: 'Playfair Display', serif; 
          font-weight: 400;
          position: relative;
          display: inline-block;
        }

        .card-info h3::after {
          content: ''; position: absolute; bottom: -5px; left: 0; 
          width: 0; height: 1px; background: var(--accent); 
          transition: width 0.4s ease;
        }
        .card:hover h3::after { width: 100%; }

        .card-footer { 
          margin-top: 25px; display: flex; align-items: center; 
          gap: 10px; opacity: 0.3; transition: 0.3s;
        }
        .view-link { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; }
        .card:hover .card-footer { opacity: 1; color: var(--accent); }

        .card-overlay {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transition: 0.5s;
        }
        .card-overlay span { padding: 10px 20px; border: 1px solid white; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px; }
        .card:hover .card-overlay { opacity: 1; }

        @media (max-width: 768px) {
          h1 { font-size: 2.5rem; }
          .grid { grid-template-columns: 1fr; }
          nav { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <nav>
        <div class="logo">3D printing Lab</div>
        <div>
          <a href="/gallery">Works</a>
          <a href="/admin">Laboratory</a>
        </div>
      </nav>

      <div class="container">
        <p style="color: var(--accent); letter-spacing: 5px; font-size: 0.7rem; margin-bottom: 20px; opacity: 0.8;">CURATED ARTWORKS</p>
        <h1>Selected <br> Artifacts</h1>
        
        <div class="grid">
          ${cardsHtml}
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/model/:id', async (c) => {
  const id = c.req.param('id');
  const isAdmin = getCookie(c, 'admin_session') === 'verified_ahmed';
  const model = await Model.findById(id);

  if (!model) return c.text("Model not found! ❌", 404);

  const imagesJson = JSON.stringify(model.images);

  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${model.title} | AHMED.3D</title>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,700&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
      <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js"></script>
      <style>
        :root { 
          --bg: #050505; 
          --accent: #c5a358; 
          --border: rgba(255, 255, 255, 0.08);
        }

        body { 
          font-family: 'Inter', sans-serif; 
          background: radial-gradient(circle at top right, #1a1a1d, #050505);
          color: white; 
          margin: 0; 
          overflow-x: hidden;
          scroll-behavior: smooth;
        }
        
        nav { 
          padding: 30px 60px; 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          background: rgba(5, 5, 5, 0.8);
          backdrop-filter: blur(20px);
          position: sticky; top: 0; z-index: 100;
          border-bottom: 1px solid var(--border);
        }
        .logo { font-family: 'Playfair Display', serif; font-size: 1.5rem; letter-spacing: 2px; color: var(--accent); }
        nav a { color: white; text-decoration: none; font-size: 0.7rem; letter-spacing: 2px; text-transform: uppercase; opacity: 0.6; transition: 0.3s; }
        nav a:hover { opacity: 1; color: var(--accent); }

        .container { 
          max-width: 1400px; 
          margin: 60px auto; 
          padding: 0 50px; 
          display: grid; 
          grid-template-columns: 1.2fr 0.8fr; 
          gap: 80px; 
        }

        .viewer-side { position: relative; }
        model-viewer {
          width: 100%; 
          height: 600px; 
          background: #0a0a0b;
          border: 1px solid var(--border);
          box-shadow: 0 30px 60px rgba(0,0,0,0.5);
          --poster-color: transparent;
        }

        .details-side { display: flex; flex-direction: column; gap: 35px; }
        .asset-label { color: var(--accent); font-size: 0.7rem; letter-spacing: 5px; text-transform: uppercase; }
        
        h1 { 
          font-family: 'Playfair Display', serif; 
          font-size: 3.8rem; 
          margin: 0; 
          line-height: 1.05; 
          font-weight: 400; 
          letter-spacing: -1px;
        }

        .description { 
          font-size: 1.05rem; 
          line-height: 1.9; 
          color: #aaa; 
          max-width: 95%;
          font-weight: 300;
        }

        .image-gallery { 
          display: grid; 
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); 
          gap: 15px; 
        }
        .image-gallery img { 
          width: 100%; height: 110px; object-fit: cover; 
          border: 1px solid var(--border);
          cursor: pointer; 
          transition: 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          filter: grayscale(0.8) brightness(0.7);
        }
        .image-gallery img:hover { 
          filter: grayscale(0) brightness(1); 
          transform: translateY(-10px) scale(1.05); 
          border-color: var(--accent);
        }

        /* --- Lightbox --- */
        #lightbox { 
          position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
          background: rgba(0,0,0,0.98); display: none; justify-content: center; 
          align-items: center; z-index: 1000;
          backdrop-filter: blur(20px);
          opacity: 0; transition: opacity 0.5s ease;
          touch-action: none; /* لمنع السكرول أثناء السحب */
        }
        #lightbox.active { opacity: 1; }
        
        #lbox-img { 
          max-width: 85%; max-height: 85%; 
          border: 1px solid var(--border);
          transform: scale(0.8);
          transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
        }
        #lightbox.active img { transform: scale(1); }

        .nav-btn {
          position: absolute; top: 50%; transform: translateY(-50%);
          background: rgba(255,255,255,0.05); border: none; color: white;
          font-size: 2.5rem; padding: 25px 15px; cursor: pointer; transition: 0.3s;
          z-index: 1010; font-family: serif;
        }
        .nav-btn:hover { color: var(--accent); background: rgba(255,255,255,0.1); }
        .prev-btn { left: 20px; }
        .next-btn { right: 20px; }

        .btn-delete {
          position: absolute; top: 20px; right: 20px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 71, 87, 0.8);
          padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px; transition: 0.4s; z-index: 10;
        }
        .btn-delete:hover { background: #ff4757; color: white; transform: scale(1.1); }

        @media (max-width: 768px) {
          .container { grid-template-columns: 1fr; gap: 40px; padding: 0 20px; }
          h1 { font-size: 2.5rem; }
          .nav-btn { display: none; } /* إخفاء الأسهم في الموبايل والاعتماد على السحب */
        }
      </style>
    </head>
    <body>
      <nav>
        <div class="logo">3D printing Lab</div>
        <div><a href="/gallery">← Back to Gallery</a></div>
      </nav>

      <div class="container">
        <div class="viewer-side">
          ${isAdmin ? `<a href="/delete/${model._id}" class="btn-delete" title="Delete" onclick="return confirm('Archive?')">🗑️</a>` : ''}
          <model-viewer src="${model.model3d}" camera-controls auto-rotate shadow-intensity="1" environment-image="neutral" exposure="1"></model-viewer>
        </div>

        <div class="details-side">
          <div class="asset-header">
            <span class="asset-label">Curated Artifact</span>
            <h1>${model.title}</h1>
          </div>
          <p class="description">${model.description || 'A unique digital artifact meticulously crafted.'}</p>
          
          <div class="gallery-section">
            <h3 style="color: var(--accent); font-family: 'Playfair Display'; font-style: italic; border-bottom: 1px solid var(--border); padding-bottom: 15px; margin-bottom: 25px;">Visual Documentation</h3>
            <div class="image-gallery">
              ${model.images.map((img, index) => `<img src="${img}" onclick="openLightbox(${index})">`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div id="lightbox">
        <button class="nav-btn prev-btn" onclick="event.stopPropagation(); changeImage(-1)">‹</button>
        <img src="" id="lbox-img" onclick="closeLightbox()">
        <button class="nav-btn next-btn" onclick="event.stopPropagation(); changeImage(1)">›</button>
      </div>

      <script>
        const images = ${imagesJson};
        let currentIndex = 0;
        let touchStartX = 0;
        let touchEndX = 0;

        function openLightbox(index) {
          currentIndex = index;
          updateLightbox();
          const lb = document.getElementById('lightbox');
          lb.style.display = 'flex';
          setTimeout(() => lb.classList.add('active'), 10);
        }

        function updateLightbox() {
          const img = document.getElementById('lbox-img');
          img.src = images[currentIndex];
        }

        function changeImage(step) {
          currentIndex = (currentIndex + step + images.length) % images.length;
          updateLightbox();
        }

        function closeLightbox() {
          const lb = document.getElementById('lightbox');
          lb.classList.remove('active');
          setTimeout(() => lb.style.display = 'none', 500);
        }

        // --- إضافة خاصية السحب (Swipe) للموبايل ---
        const lbContainer = document.getElementById('lightbox');

        lbContainer.addEventListener('touchstart', e => {
          touchStartX = e.changedTouches[0].screenX;
        }, false);

        lbContainer.addEventListener('touchend', e => {
          touchEndX = e.changedTouches[0].screenX;
          handleSwipe();
        }, false);

        function handleSwipe() {
          const swipeThreshold = 50; // المسافة الأدنى للسحب
          if (touchEndX < touchStartX - swipeThreshold) {
            changeImage(1); // سحب لليسار -> التالي
          }
          if (touchEndX > touchStartX + swipeThreshold) {
            changeImage(-1); // سحب لليمين -> السابق
          }
        }

        // دعم الكيبورد
        document.addEventListener('keydown', (e) => {
          if (lbContainer.classList.contains('active')) {
            if (e.key === 'ArrowRight') changeImage(1);
            if (e.key === 'ArrowLeft') changeImage(-1);
            if (e.key === 'Escape') closeLightbox();
          }
        });
      </script>
    </body>
    </html>
  `);
});

app.get('/login-secure', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Secure Access | 3D printing Lab</title>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@300&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg: #050505;
          --accent: #c5a358;
          --border: rgba(255, 255, 255, 0.08);
        }

        body { 
          margin: 0;
          background: var(--bg);
          color: white;
          font-family: 'Inter', sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          overflow: hidden;
        }

        /* تأثير الخلفية المتدرجة الهادئة */
        body::before {
          content: '';
          position: absolute;
          width: 150%;
          height: 150%;
          background: radial-gradient(circle at center, #1a1a1d 0%, #050505 70%);
          z-index: -1;
        }

        .login-card {
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(20px);
          padding: 60px 40px;
          border: 1px solid var(--border);
          text-align: center;
          width: 350px;
          position: relative;
          transition: 0.5s;
        }

        /* الزوايا الذهبية المميزة للمعمل */
        .login-card::before {
          content: ''; position: absolute; top: -1px; left: -1px; width: 30px; height: 30px;
          border-top: 1px solid var(--accent); border-left: 1px solid var(--accent);
        }

        h2 {
          font-family: 'Playfair Display', serif;
          font-size: 2rem;
          margin-bottom: 10px;
          letter-spacing: 1px;
        }

        .desc {
          font-size: 0.65rem;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 4px;
          margin-bottom: 40px;
          display: block;
        }

        input[type="password"] {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border);
          padding: 12px 0;
          color: white;
          text-align: center;
          font-size: 1rem;
          outline: none;
          transition: 0.3s;
          margin-bottom: 30px;
          box-sizing: border-box;
        }

        input[type="password"]:focus {
          border-bottom-color: var(--accent);
          letter-spacing: 5px; /* تأثير لطيف عند الكتابة */
        }

        button {
          background: transparent;
          border: 1px solid var(--accent);
          color: var(--accent);
          padding: 12px 30px;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 2px;
          cursor: pointer;
          transition: 0.4s;
          width: 100%;
        }

        button:hover {
          background: var(--accent);
          color: black;
          box-shadow: 0 10px 20px rgba(197, 163, 88, 0.15);
        }

        .back-link {
          margin-top: 25px;
          display: block;
          font-size: 0.6rem;
          text-decoration: none;
          color: rgba(255,255,255,0.3);
          letter-spacing: 1px;
          transition: 0.3s;
        }
        .back-link:hover { color: white; }
      </style>
    </head>
    <body>
      <div class="login-card">
        <h2>Authentication</h2>
        <span class="desc">Encrypted Access Only</span>
        
        <form action="/login-secure" method="POST">
          <input type="password" name="password" placeholder="SECRET KEY" required>
          <button type="submit">Verify Identity</button>
        </form>

        <a href="/gallery" class="back-link">← PUBLIC GALLERY</a>
      </div>
    </body>
    </html>
  `);
});

app.post('/login-secure', async (c) => {
const ADMIN_PASS = process.env.ADMIN_PASSWORD; 
  const body = await c.req.parseBody();
  if (body.password === ADMIN_PASS) {
    // هنا بنحط الـ Cookie وتفضل شغالة لمدة أسبوع
    setCookie(c, 'admin_session', 'verified_ahmed', {
      path: '/',
      secure: true, // عشان متتسرقش من الشبكة
      httpOnly: true, // عشان مفيش فيرس (JS) يسرقها
      maxAge: 60 * 60 * 24 * 7, // أسبوع
    });
    return c.redirect('/admin');
  }
  return c.text("Wrong Password! ❌");
});

app.get('/delete/:id', async (c) => {
  const auth = getCookie(c, 'admin_session');
  if (auth !== 'verified_ahmed') return c.redirect('/login-secure');
  const id = c.req.param('id');
  await Model.findByIdAndDelete(id);
  return c.redirect('/gallery');
});

app.get("/", (c) => {
    return c.json({
        message: "Hello, Hono with Bun!",
        status : "success from backend"
    })
});


export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
}
