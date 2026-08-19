# Bitig — Özellikler & Fark Yaratan Yetenekler (FEATURES.md)

> **v0.9.0** — Port Sniffer, Smart Links ve Secret Shield dahil tüm Geliştirici
> Kokpit özellikleri tamamlandı. Bu doküman, **Bitig**'in sıradan bir terminal
> öykünücüsünün ötesine geçerek modern bir **Geliştirici Kokpiti** haline
> gelmesini sağlayan temel ve benzersiz yeteneklerini detaylandırır.

---

## 🎯 Vizyon: Neden Başka Bir Terminal Değil?

Mevcut Windows ekosistemindeki terminaller iki uca savrulmuştur:
1. **Windows Terminal:** Hızlı ve kararlıdır ancak "düz bir metin kutusu"dur; modern geliştirici araçlarından, akıllı bağlamdan ve etkileşimli yardımcılardan yoksundur.
2. **Warp / Bulut Tabanlı Terminaller:** Zengin özellikler sunar ancak zorunlu hesap kaydı, bulut telemetrisi ve kurumsal ortamlarda güvenlik/gizlilik endişesi yaratır.

**Bitig'in Temel Felsefesi:**
* ⚡ **%100 Yerel ve Bağımsız:** Sıfır bulut bağımlılığı, sıfır telemetri. Tüm veriler yerel JSON olarak `%APPDATA%/Bitig/` altında saklanır.
* 🛡️ **Güvenlikten Taviz Yok:** Katı Electron sandboxing (`contextIsolation: true`, Node `vm` izole eklenti ortamı).
* 🎹 **Önce Klavye:** Her yetenek faresiz, tek bir kısayolla yönetilebilir.
* 🛠️ **Geliştirici Odaklı:** Sıradan metin akışını akıllı, tıklanabilir, parametrik ve izlenebilir bir iş istasyonuna dönüştürür.

---

## 📊 Karşılaştırma Matrisi

| Özellik | Windows Terminal | Warp | Hyper / Tabby | **Bitig** |
|---|:---:|:---:|:---:|:---:|
| **ConPTY Windows Entegrasyonu** | ✅ Native | ❌ (Özel motor) | ⚠️ (node-pty) | ✅ **ConPTY + xterm.js** |
| **Yerel Parametrik Runbook ("Bitig Betik")** | ❌ Yok | ⚠️ (Bulut/Hesaplı) | ❌ Yok | 🚀 **Dahili & Yerel JSON (`Ctrl+Shift+B`)** |
| **Canlı Port & Servis Dinleyicisi (Port Sniffer)** | ❌ Yok | ❌ Yok | ❌ Yok | 🌐 **Dahili — Shipped v0.9.0 (ANSI-stripped, buffered, tıkla-aç)** |
| **Secret Shield (Token/Şifre Sansürü)** | ❌ Yok | ❌ Yok | ❌ Yok | 🛡️ **Dahili (Otomatik Maskeleme)** |
| **Yerel AI Asistanı (Ollama / BYOK)** | ⚠️ (Copilot Sidebar) | ⚠️ (Warp AI / Bulut) | ❌ Yok | 💡 **Dahili (Ollama + BYOK / Sıfır İz)** |
| **Quake / Dropdown HUD Modu** | ⚠️ (Ayrı mod/ayar) | ❌ Yok | ⚠️ (Eklentiyle) | 🪟 **Dahili (`Win+~` / `Ctrl+~`)** |
| **Broadcast Input (Eşzamanlı Split Yayını)** | ❌ Yok | ❌ Yok | ⚠️ (Bazı sürümlerde) | 🔴 **Dahili (`Alt+Shift+I`)** |
| **IDE Akıllı Linkleri (Dosya:Satır Açma)** | ❌ (Sadece URL) | ⚠️ (Kısmi) | ❌ (Sadece URL) | 🔗 **Dahili (`vscode://`, Cursor, vb.)** |
| **Nerd Font Glyph Canlı Ölçüm & Tespiti** | ❌ Yok | ❌ Yok | ❌ Yok | ✨ **Dahili (Canvas PUA Probe)** |

---

## 🚀 7 Benzersiz Temel Özellik

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         B I T I G   K O K P I T                          │
├──────────────────────────────────────────────────────────────────────────┤
│ 🌐 Portlar: [:3000 (Next.js)] [:5173 (Vite)]      [Quake HUD: Win+~]     │
│ ⚡ Betik: [Docker Dev Cluster]                    [Broadcast: Alt+Shift+I]│
│ 🛡️ Secret Shield: [1 API Key Maskelendi]          [Bilge AI: Ctrl+I]      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### 1. "Bitig Betik" — Parametrik Runbook & Snippet Yöneticisi (`Ctrl+Shift+B`)

#### 🔴 Problem
Geliştiriciler her gün onlarca parametreli ve uzun komut çalıştırır:
* `docker run -d -p 8080:80 -v C:\proje:/app --name api-dev node:20`
* `ffmpeg -i input.mp4 -c:v libx264 -crf 23 -c:a aac output.mp4`
* `git push origin HEAD:refs/for/main%topic=feature-xyz`
* `kubectl port-forward svc/my-service 8080:80 -n staging`

Bu komutları ezberlemek, not uygulamasından kopyala-yapıştır yapıp tırnakları/portları elle düzenlemek hata riskini artırır ve zaman kaybettirir.

#### 🟢 Bitig Çözümü
`Ctrl+Shift+B` kısayoluna basıldığında açılan arama penceresinden şablon seçilir. Bitig, şablon içindeki `{{değişken}}` alanlarını anında dinamik bir form arayüzüne dönüştürür. Geliştirici değerleri girip Enter'a bastığı anda derlenmiş komut doğrudan terminal prompt'una yazılır.

#### 🛠️ Şablon Şeması (`%APPDATA%/Bitig/snippets.json`)
```jsonc
{
  "snippets": [
    {
      "id": "docker-run-volume",
      "name": "Docker Container Başlat (Port & Volume)",
      "description": "Port yönlendirmesi ve dizin bağlamasıyla container açar",
      "category": "Docker",
      "command": "docker run -d -p {{host_port:3000}}:{{container_port:3000}} -v \"{{host_dir:%CD%}}\":{{container_dir:/app}} --name {{name:my-app}} {{image:node:20-alpine}}",
      "variables": {
        "host_port": { "label": "Host Portu", "default": "3000" },
        "container_port": { "label": "Container Portu", "default": "3000" },
        "host_dir": { "label": "Yerel Dizin", "default": "%CD%" },
        "container_dir": { "label": "Hedef Dizin", "default": "/app" },
        "name": { "label": "Container Adı", "default": "app-dev" },
        "image": { "label": "Docker İmajı", "default": "node:20-alpine" }
      }
    }
  ]
}
```

---

### 2. Canlı Port ve Servis Dinleyicisi (Live Port Sniffer) ✅ Shipped v0.9.0

#### 🔴 Problem
Bir backend veya frontend geliştirirken (`npm run dev`, `cargo run`, `docker compose up`, `python manage.py runserver`), uygulamanın hangi portta ayağa kalktığını görmek için akan logları taramak gerekir.

#### 🟢 Bitig Çözümü (v0.9.0'da tamamlandı)
Bitig'in renderer katmanındaki `PortSniffer` sınıfı, gelen PTY çıktısını analiz eder:
* **ANSI escape sequence'leri** tarama öncesi temizlenir — renk kodları regex'i kırmaz.
* **Per-leaf rolling buffer** (512 karakter) ile parçalı PTY chunk'larındaki URL'ler kaybolmaz.
* Port açıldığı an sekme başlığında yeşil, yanıp sönen interaktif bir rozet belirir: `🟢 :5173`.
* **Rozet Aksiyonları:**
  1. **Tek Tıkla Aç:** Varsayılan tarayıcıda `http://localhost:PORT` açılır (`shell.openExternal`).
  2. False positive önleme: `ready in 153 ms` gibi milisaniye değerleri port olarak yakalanmaz.

---

### 3. Akıllı Linkler & IDE Entegrasyonu (Smart Hyperlinks) ✅ Shipped v0.9.0

#### 🔴 Problem
Terminalde derleme hatası, test sonucu veya log akarken bir dosya konumu basıldığında (`at src/renderer/src/main.ts:42:15` veya `C:\Repo\error.log:120`), standart terminaller bunu düz metin olarak gösterir veya sadece `http://` linklerini tıkletir. Dosyayı editörde elle arayıp o satıra gitmek dakikalar çalar.

#### 🟢 Bitig Çözümü (v0.9.0'da tamamlandı)
Bitig, `src/renderer/src/smartLinks.ts` içinde xterm.js'e özel link sağlayıcı kaydeder:
* Yığın izi desenlerini tanır: `src/main.ts:42:15`, `C:\Users\...\file.py:102`.
* `Ctrl + Sol Tık` ile dosya doğrudan VS Code / Cursor'da tam satır ve sütunda açılır:
  ```
  vscode://file/c:/Users/samet/Desktop/Bitig/src/renderer/src/main.ts:42:15
  ```
* `cockpit:open-file` IPC kanalı üzerinden `shell.openExternal` ile açılır.

---

### 4. Secret Shield — Gizli Bilgi & Token Kalkanı ✅ Shipped v0.9.0

#### 🔴 Problem
Canlı yayınlarda veya ekran paylaşımı yaparken `cat .env`, `echo $STRIPE_KEY` gibi komutlar çalıştırıldığında hassas API anahtarları açığa çıkar.

#### 🟢 Bitig Çözümü (v0.9.0'da tamamlandı)
`src/renderer/src/secretShield.ts` ve `src/main/history/historyStore.ts` birlikte çalışır:
* **Algılanan Desenler:**
  * JWT Tokenlar (`eyJ...`)
  * AWS Access Key (`AKIA[0-9A-Z]{16}`)
  * GitHub Personal Access Token (`ghp_[0-9a-zA-Z]{36}`)
  * OpenAI / Anthropic API Key (`sk-...`, `sk-ant-...`)
  * Özel Anahtarlar (`-----BEGIN RSA PRIVATE KEY-----`)
* **Kalkan Davranışı:**
  * Komut **geçmişine kaydedilirken** otomatik olarak `ghp_************` şeklinde maskelenir — shoulder surfing ve ekran paylaşımı sızıntılarını önler.
  * Ekran maskeleme (render katmanı) roadmap'teki bir sonraki adımdır.

---

### 5. "Bitig Bilge" — Yerel & Gizlilik Odaklı AI Asistanı (`Ctrl+I`)

#### 🔴 Problem
Komut satırında bilinmeyen bir hata alındığında (`exit code != 0`), terminalden kopyalayıp tarayıcıda aratmak geliştirici akışını böler. Şirket kodlarını veya loglarını bulut AI servislerine yapıştırmak ise veri güvenliği politikalarına aykırıdır.

#### 🟢 Bitig Çözümü
* **%100 Yerel (Ollama / LM Studio) veya BYOK (Bring Your Own Key):** Bitig hiçbir veriyi kendi sunucularına iletmez. Kullanıcı ister yerel `http://localhost:11434` (Ollama) bağlar, ister kendi OpenAI / Gemini / Claude / DeepSeek anahtarını girer.
* **Akıllı Hata Çözücü:** Komut hata verdiğinde yanında beliren `💡 Hatayı Açıkla` butonuna basıldığında sadece son komut ve ilgili hata satırları modele gönderilerek anında çözüm önerisi sunulur.
* **Doğal Dilden Komuta (Ghost Prompt - `Ctrl+I`):**
  * `Ctrl+I` basıp *"100MB'tan büyük tüm .log dosyalarını bul ve sil"* yazıldığında, aktif shell'e uygun (PowerShell veya Bash) doğru komut üretilir ve `Tab` ile terminale aktarılır.

---

### 6. Quake / Dropdown HUD Modu (`Win+~` / `Ctrl+~`)

#### 🔴 Problem
Hızlı bir Git komutu çalıştırmak, bir paketi derlemek veya curl isteği atmak için açık olan onlarca pencere arasından terminali bulup öne getirmek zaman kaybıdır.

#### 🟢 Bitig Çözümü
* `Win+~` (veya ayarlanabilir `Ctrl+~`) tuşuna basıldığı an Bitig, ekranın üst kenarından yumuşak bir animasyonla kayarak inen yarı saydam bir HUD penceresi olarak belirir.
* İş bittiğinde aynı tuşla veya terminal dışına tıklandığında (odak kaybında) sessizce yukarı kayarak gizlenir.
* Arka planda çalışan işlemler kesintisiz devam eder.

---

### 7. Broadcast Input — Eşzamanlı Komut Yayını (`Alt+Shift+I`)

#### 🔴 Problem
Bir sekme içinde 4 split pane açıp farklı sunuculara veya mikroservislere bağlandığınızda, `git pull`, `systemctl restart service` veya `docker ps` gibi aynı komutu tüm pane'lere tek tek yazmak gerekir.

#### 🟢 Bitig Çözümü
* `Alt+Shift+I` kısayoluyla **Broadcast Modu** aktif edilir.
* Pencere etrafında dikkat çekici kırmızı bir senkronizasyon çerçevesi (`🔴 BROADCAST AKTİF`) belirir.
* Odaklı pane'de klavyeden bastığınız her karakter, aynı sekmedeki tüm split pane'lere milisaniyesinde eşzamanlı olarak iletilir.
* Mod kapatıldığında paneller tekrar bağımsız çalışmaya döner.

---

## 🏗️ Mimari Prensipler

Bitig'deki her yeni özellik şu 4 altın kurala uymak zorundadır:

1. **Performanstan Ödün Yok (Zero Latency):** Terminal metin akışı PTY ve xterm.js arasında doğrudan akar. Ekstra analizler (port sniffer, secret shield) asenkron çalışır ve klavye girişinde en ufak bir gecikme (input lag) yaratamaz.
2. **Klavye Dostu (Keyboard-First):** Her eylem bir kısayola (`actionId`) bağlanabilir ve Komut Paleti (`Ctrl+Shift+P`) üzerinden erişilebilir.
3. **Veri Egemenliği (Data Sovereignty):** Kullanıcı verileri (şablonlar, geçmiş, ayarlar, API anahtarları) kullanıcının kendi bilgisayarında şifrelenmiş veya düz JSON olarak saklanır.
4. **İzole Eklenti Mimarisi:** Eklentiler Node.js `vm` modülü içinde, sadece izin verilen Bitig API'lerine erişebilir; işletim sistemi çekirdeğine doğrudan yetkisiz erişim sağlayamaz.

---

*Bitig — Eski Türkçede "Yazı, Betik, Yazılı Metin". Geleceğin komut satırı deneyimi.*
