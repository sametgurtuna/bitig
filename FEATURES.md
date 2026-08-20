<div align="center">

# Bitig · Ozellikler ve Fark Yaratan Yetenekler

<sub>Surum <b>1.0.0</b> · Kokpit zekasi, yerel AI ve korumali eklenti sistemi tamamlandi</sub>

<sub><a href="README.md">README</a> · <a href="CHANGELOG.md">Changelog</a> · <a href="ROADMAP.md">Roadmap</a></sub>

</div>

---

## Vizyon: Neden Baska Bir Terminal?

Windows ekosistemindeki terminaller iki uca savrulmus durumda:

| | Guclu yani | Zayif yani |
|---|---|---|
| **Windows Terminal** | Hizli, kararli, native ConPTY | Duz bir metin kutusu; akilli baglam ve etkilesimli yardimci yok |
| **Warp ve bulut tabanli terminaller** | Zengin ozellik seti | Zorunlu hesap, bulut telemetrisi, kurumsal ortamda gizlilik sorunu |

Bitig bu iki ucun arasini kapatmayi hedefler. Dort temel ilke:

| Ilke | Ne anlama geliyor |
|---|---|
| **Yuzde 100 yerel** | Sifir bulut bagimliligi, sifir telemetri, hesap yok. Tum veri `%APPDATA%/Bitig/` altinda duz JSON. |
| **Guvenlikten taviz yok** | Kati Electron izolasyonu (`contextIsolation: true`, `sandbox: true`), eklentiler icin ayri bir Node `vm` baglami. |
| **Once klavye** | Her yetenek faresiz, tek bir kisayolla yonetilebilir; her kisayol yeniden atanabilir. |
| **Gelistirici odakli** | Siradan metin akisini tiklanabilir, parametrik ve izlenebilir bir is istasyonuna cevirir. |

---

## Karsilastirma Matrisi

Gosterim: `+` dahili ve tam destek, `~` kismi ya da eklentiyle, `-` yok.

| Ozellik | Windows Terminal | Warp | Hyper / Tabby | Bitig 1.0 |
|---|:---:|:---:|:---:|:---|
| ConPTY entegrasyonu | `+` native | `-` ozel motor | `~` node-pty | `+` **ConPTY + xterm.js** |
| Yerel parametrik runbook | `-` | `~` bulut / hesap | `-` | `+` **Bitig Betik, yerel JSON (`Ctrl+Shift+B`)** |
| Canli port dinleyicisi | `-` | `-` | `-` | `+` **ANSI temizlemeli, tamponlu, tikla-ac** |
| Secret Shield (token sansuru) | `-` | `-` | `-` | `+` **Otomatik maskeleme** |
| Yerel AI asistani | `~` Copilot | `~` Warp AI, bulut | `-` | `+` **Ollama + BYOK (`Ctrl+I`)** |
| Quake / dropdown HUD | `~` ayri mod | `-` | `~` eklentiyle | `+` **Dahili (`Win+~`)** |
| Broadcast input | `-` | `-` | `~` bazi surumler | `+` **Dahili (`Alt+Shift+I`)** |
| IDE akilli linkleri | `-` sadece URL | `~` kismi | `-` sadece URL | `+` **`vscode://`, Cursor** |
| Nerd Font glyph olcumu | `-` | `-` | `-` | `+` **Canvas PUA probe** |
| Korumali eklenti calisma ortami | `-` | `-` | `~` tam Node erisimi | `+` **Node `vm`, izin listeli API** |

---

## Kokpit Yuzeyi

```
┌────────────────────────────────────────────────────────────────────────┐
│  B I T I G   K O K P I T                                               │
├────────────────────────────────────────────────────────────────────────┤
│  Portlar   :3000 (Next.js)   :5173 (Vite)      Quake HUD    Win+~      │
│  Betik     Docker Dev Cluster                  Broadcast    Alt+Shift+I│
│  Kalkan    1 API anahtari maskelendi           Bilge AI     Ctrl+I     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Bitig Betik: Parametrik Runbook Yoneticisi

`Ctrl+Shift+B` · Shipped v0.8.0

**Problem.** Gelistiriciler her gun onlarca parametreli, uzun komut calistirir:

```
docker run -d -p 8080:80 -v C:\proje:/app --name api-dev node:20
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -c:a aac output.mp4
kubectl port-forward svc/my-service 8080:80 -n staging
```

Bunlari ezberlemek, not uygulamasindan kopyalayip tirnaklari ve portlari elle
duzenlemek hem zaman kaybi hem hata kaynagidir.

**Cozum.** `Ctrl+Shift+B` ile acilan arama penceresinden sablon secilir. Bitig,
sablondaki `{{degisken}}` alanlarini aninda dinamik bir forma cevirir. Degerler
girilip `Enter`'a basildiginda derlenmis komut dogrudan aktif terminale yazilir.
Canli onizleme, komut calismadan once tam olarak ne calisacagini gosterir.

<details>
<summary><b>Sablon semasi</b> (<code>%APPDATA%/Bitig/snippets.json</code>)</summary>

```jsonc
{
  "snippets": [
    {
      "id": "docker-run-volume",
      "name": "Docker Container Baslat (Port & Volume)",
      "description": "Port yonlendirmesi ve dizin baglamasiyla container acar",
      "category": "Docker",
      "command": "docker run -d -p {{host_port}}:{{container_port}} -v \"{{host_dir}}\":{{container_dir}} --name {{name}} {{image}}",
      "variables": {
        "host_port":      { "label": "Host Portu",     "default": "3000" },
        "container_port": { "label": "Container Portu","default": "3000" },
        "host_dir":       { "label": "Yerel Dizin",    "default": "%CD%" },
        "container_dir":  { "label": "Hedef Dizin",    "default": "/app" },
        "name":           { "label": "Container Adi",  "default": "app-dev" },
        "image":          { "label": "Docker Imaji",   "default": "node:20-alpine" }
      }
    }
  ]
}
```

</details>

---

## 2. Canli Port ve Servis Dinleyicisi

Shipped v0.9.0

**Problem.** `npm run dev`, `cargo run`, `docker compose up` calistirildiginda
uygulamanin hangi portta ayaga kalktigini gormek icin akan loglari taramak
gerekir.

**Cozum.** `src/renderer/src/portSniffer.ts` gelen PTY ciktisini analiz eder:

- **ANSI escape dizileri** tarama oncesi temizlenir, renk kodlari regex'i kirmaz.
- **Yaprak basina kayan tampon** (512 karakter) parcali PTY chunk'larinda bolunen
  URL'lerin kaybolmasini engeller.
- Port acildigi an sekme basliginda ve durum cubugunda tiklanabilir, nabiz atan
  bir rozet belirir. Tek tikla `http://localhost:PORT` varsayilan tarayicida acilir.
- `ready in 153 ms` gibi milisaniye degerleri port olarak yakalanmaz.

---

## 3. Akilli Linkler ve IDE Entegrasyonu

Shipped v0.9.0

**Problem.** Bir derleme hatasi `at src/renderer/src/main.ts:42:15` bastiginda
standart terminaller bunu duz metin olarak gosterir. Dosyayi editorde elle arayip
o satira gitmek akisi boler.

**Cozum.** `src/renderer/src/smartLinks.ts` xterm.js'e ozel bir link saglayici
kaydeder. Yigin izi desenlerini tanir (`src/main.ts:42:15`,
`C:\Users\...\file.py:102`) ve `Ctrl + Sol Tik` ile dosyayi tam satir ve sutunda
editorde acar:

```
vscode://file/c:/Users/samet/Desktop/Bitig/src/renderer/src/main.ts:42:15
```

Acma islemi `cockpit:open-file` kanali uzerinden `shell.openExternal` ile yapilir.

---

## 4. Secret Shield: Gizli Bilgi Kalkani

Shipped v0.9.0

**Problem.** Canli yayinda veya ekran paylasiminda `cat .env`, `echo $STRIPE_KEY`
gibi komutlar hassas anahtarlari acik eder. Daha kotusu, bu komutlar komut
gecmisine duz metin olarak yazilir ve orada kalir.

**Cozum.** `src/renderer/src/secretShield.ts` ve
`src/main/history/historyStore.ts` birlikte calisir.

| Algilanan desen | Ornek |
|---|---|
| JWT token | `eyJhbGciOi...` |
| AWS access key | `AKIA[0-9A-Z]{16}` |
| GitHub PAT | `ghp_[0-9a-zA-Z]{36}` |
| OpenAI / Anthropic anahtari | `sk-...`, `sk-ant-...` |
| Ozel anahtar blogu | `-----BEGIN RSA PRIVATE KEY-----` |

Komut gecmise kaydedilirken deger otomatik olarak `ghp_************` seklinde
maskelenir. Boylece gecmiste arama yapmak sizinti riski tasimaz.

---

## 5. Bitig Bilge: Yerel ve Gizlilik Odakli AI Asistani

`Ctrl+I` · Shipped v0.9.8

**Problem.** Bilinmeyen bir hata alindiginda terminalden kopyalayip tarayicida
aratmak akisi boler. Sirket kodlarini veya loglarini bulut AI servislerine
yapistirmak ise cogu veri guvenligi politikasina aykiridir.

**Cozum.**

- **Yuzde 100 yerel veya BYOK.** Ollama (`http://localhost:11434`) ile hicbir veri
  makineden cikmaz; ya da kendi OpenAI, Anthropic, Gemini, DeepSeek anahtarinizi
  girersiniz. Bitig hicbir veriyi kendi sunucularina iletmez, cunku boyle bir
  sunucu yoktur.
- **Dogal dilden komuta.** `Ctrl+I` basip *"100MB'tan buyuk tum .log dosyalarini
  bul ve sil"* yazildiginda aktif shell'e uygun komut uretilir. `Enter` aninda
  calistirir, `Tab` duzenlemek uzere terminale aktarir.
- **Akilli hata cozucu.** Son komut ve ilgili hata satirlari analiz edilerek
  uygulanabilir bir cozum uretilir.
- **Anahtar yonetimi.** API anahtarlari yalnizca `%APPDATA%/Bitig/settings.json`
  icinde saklanir, ayarlar panelinde maskeli girilir ve canli baglanti testi
  butonu vardir.

---

## 6. Quake / Dropdown HUD Modu

`Win+~` veya `Ctrl+~` · Shipped v0.9.5

**Problem.** Hizli bir Git komutu icin acik olan onlarca pencere arasindan
terminali bulup one getirmek zaman kaybidir.

**Cozum.** Kisayola basildigi an Bitig, ana ekranin ust kenarindan yari saydam,
her zaman ustte bir HUD penceresi olarak iner. `quake:toggle` ve
`quake:set-hotkey` kanallariyla calisma zamaninda kontrol edilir; `autoHideOnBlur`
ile odak kaybedildiginde otomatik gizlenir.

---

## 7. Broadcast Input: Es Zamanli Komut Yayini

`Alt+Shift+I` · Shipped v0.9.5

**Problem.** Bir sekmede dort split pane acip farkli sunuculara baglandiginizda
`git pull` veya `systemctl restart` gibi ayni komutu tek tek yazmak gerekir.

**Cozum.** Broadcast modu acikken odakli pane'de yazilan her tus, ayni sekmedeki
tum pane'lerin PTY oturumlarina es zamanli iletilir. Pencere cevresinde nabiz
atan kirmizi bir cerceve ve ust kenardan inen bir uyari banner'i, yanlislikla
komut calistirmayi engelleyecek kadar belirgindir. Mod kapatilinca panel'ler
tekrar bagimsiz calisir.

---

## 8. Korumali Eklenti Sistemi

Shipped v1.0.0

**Problem.** Eklenti destegi genellikle ya hic yoktur ya da eklentilere tam Node
erisimi verir; bu da her eklentiyi potansiyel bir guvenlik acigi haline getirir.

**Cozum.** Her eklenti `%APPDATA%/Bitig/plugins/<id>/` altinda bir `plugin.json`
manifesti ve bir giris betiginden olusur. Betik, `require`, `process` ve `fs`
gibi global'lerin bulunmadigi izole bir Node `vm` baglaminda calisir. Erisilebilen
tek yuzey, acikca izin verilen `bitig` nesnesidir:

| API | Amac |
|---|---|
| `bitig.ui.setStatusBarWidget` | Durum cubuguna canli bir bilesen ekler |
| `bitig.actions.register` | Komut paletine ve kisayol sistemine aksiyon ekler |
| `bitig.getGitBranch` | Aktif dizindeki Git dalini doner |
| `bitig.getSystemMemory` | Sistem bellek kullanimini doner |
| `bitig.openUrl` | Varsayilan tarayicida bir URL acar |
| `bitig.setInterval` | Eklenti kapatilinca otomatik temizlenen zamanlayici |

Uc referans eklenti hazir gelir: `git-status` (aktif dal), `system-monitor`
(canli RAM kullanimi) ve `quick-web-search` (Google ve Stack Overflow aramasi
icin evrensel aksiyonlar).

---

## Mimari Prensipler

Bitig'e eklenen her yeni ozellik su dort kurala uymak zorundadir.

1. **Sifir gecikme.** Terminal metin akisi PTY ile xterm.js arasinda dogrudan
   akar. Ek analizler (port sniffer, secret shield, telemetri) asenkron calisir
   ve klavye girisinde en ufak bir gecikme yaratamaz.
2. **Once klavye.** Her eylem bir `actionId`'ye baglanir, yeniden atanabilir ve
   Komut Paleti (`Ctrl+Shift+P`) uzerinden erisilebilir.
3. **Veri egemenligi.** Kullanici verileri (sablonlar, gecmis, ayarlar, API
   anahtarlari) yalnizca kullanicinin kendi makinesinde, duz JSON olarak durur.
4. **Izole eklenti mimarisi.** Eklentiler Node `vm` icinde, yalnizca izin verilen
   Bitig API'lerine erisir; isletim sistemine dogrudan yetkisiz erisim saglayamaz.

---

<div align="center">
<sub><b>Bitig</b> · Eski Turkcede "yazi, betik, yazili metin".</sub>
</div>
