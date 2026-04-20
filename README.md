# 🎄 Melty's Christmas Lights Studio

**The most gorgeous, extremely customizable, OBS-ready Christmas lights overlay this side of the North Pole!**

![Version](https://img.shields.io/badge/version-2025-green)
![Three.js](https://img.shields.io/badge/Three.js-r182-red)

---
### [Open Melty's Christmas Lights Studio](https://lights.melty.lol)  
> [!NOTE]
> <sup> *designed to work best in obs or chrome* <sup>

# 📺 OBS Browser Source Setup

This overlay is designed to be used as an **OBS Browser Source**. You can also open it in Chrome to play around and design your perfect lights before streaming! Just make sure to use the export feature as setting things up in your browser will not save them to the same location that the **OBS Browser Source** will read from!

### Step-by-Step Setup

1. In OBS, click the **+** button under Sources
2. Select **Browser**
3. Give it a name (like "Christmas Lights" or "Holiday Magic" ✨)
4. Set the **URL** to:
   ```
   https://lights.melty.lol
   ```
5. Set **Width** to your stream width (e.g., 1920)
6. Set **Height** to your stream height **+ 100 pixels**
   - Streaming at 1920×1080? Use **1920 × 1180**
   - Streaming at 2560×1440? Use **2560 × 1540**
   - Streaming at 1280×720? Use **1280 × 820**
7. Set the **FPS** to match your stream framerate (30 or 60)
8. ✅ Check **"Shutdown source when not visible"** (saves your pc from frying when you're lights are not being shown on stream)
9. ✅ Check **"Refresh browser when scene becomes active"** (keeps things fresh)
10. Click **OK**

> **Why +100px height?** The "Show UI" button lives at the bottom of the frame. The extra height keeps it accessible for you, but hidden from your viewers!

# 🎁 Customizing Your Lights!

Once the browser source is added, you can customize your lights while off stream or while live:

1. Right-click on your Christmas Lights source in OBS
2. Click **"Interact"**
3. A popup window opens - you can now click buttons and adjust sliders!
4. Every change you make happens live on your stream 🎉
5. When you're done, just close the Interact window
    - note: if you run into any issues, open the broswer source properties, scroll to the bottom, and click "Refresh Cache"
> [!TIP] 
> ### Pro Tip: Nested Scene Setup
> For the cleanest workflow, use a **nested scene**:
> 1. Create a brand new scene and name it "Christmas Lights"
> 2. Add the browser source to THIS scene (not your main streaming scene)
> 3. Go to your main streaming scene
> 4. Click **+** → **Scene** → select "Christmas Lights"
> 5. Now you can easily toggle the entire overlay on/off!

---

## 🎓 Lots of Settings? Don't Worry!

There are a TON of settings to play with - but don't feel overwhelmed!

**Click on Melty's logo** (the little goofy looking dude in the top left corner of the UI) and an interactive tutorial will walk you through everything you can do. It's like having a helpful elf guide you through the workshop! 🧝

---

## ✨ Features

- 🌸 **Bloom Effects** - Beautiful glow with adjustable intensity
- 🎨 **7 Twinkle Styles** - Static, Soft Twinkle, Alternating, Chase, Random Sparkle, Party, Color Fade
- 🌈 **10+ Light Color Themes** - Classic, Rainbow, Vintage, Candy Cane, Winter, and more
- 💡 **Customizable Bulbs** - Adjust size, intensity, spacing, and socket colors
- 🌟 **10+ Wire Color Themes** - Match your aesthetic perfectly
- 🔧 **Wire Physics** - Realistic sag and tension controls
- ❄️ **Environmental Effects** - Snow, stars, and shooting stars
- 📱 **OBS Ready** - Transparent background support for streaming
- 👉🏼 **Full Featured UI** - Easy to use with a built-in tutorial
- 💾 **Save & Export** - Create, save, and export custom presets

---

# 📴 Local/Offline Version

Want to use this without an internet connection? There's a local version included!

### How to Download

1. On this GitHub page, click the green **"Code"** button
2. Click **"Download ZIP"**
3. Find the downloaded ZIP file (usually in your Downloads folder)
4. **Right-click** the ZIP file and choose **"Extract All..."** or **"Unzip"**
5. Open the extracted folder and find the **`local`** folder inside
6. Move that **`local`** folder to wherever you want to keep it (lets not make this the desktop or downloads folder... lets be good little streamers and stay organized😊)


### Using Local Version in OBS

1. Follow the OBS setup steps above, but for the URL, check the **local file box** and use the path to the local folder instead:
   ```
   file:///C:/path/to/local/index.html
   ```
2. Replace `C:/path/to/` with wherever you saved the local folder on your computer
3. For example: `file:///C:/Users/YourName/Desktop/local/index.html`

> **Heads up:** The local version won't automatically update. Check back on GitHub for new releases!

---

## �🛠️ Browser Support

- ✅ **Chrome** - Recommended for the best experience!
- ✅ **OBS Browser Source** - Works perfectly as an overlay
- ⚠️ **Other browsers** - May or may not work. Stick with Chrome!

---

## 📜 Usage Terms

**© 2025 Melty. All Rights Reserved.**

This is for **personal use only**!

**You CAN:**
- ✅ Use it on your stream
- ✅ Show it off to friends
- ✅ Send screenshots to make people jealous
- ✅ Share the GitHub link with others

**Please DON'T:**
- ❌ Use it without asking me first
- ❌ Redistribute without permission
- ❌ Upload it to other websites
- ❌ Claim it as your own
- ❌ Sell it or include in paid stuff

Want to use it? Just ask! I'm pretty chill about it. 😊

---

## 💝 Show Me Your Lights!

I LOVE seeing people use this project! If you set up some cool lights on your stream:

**Take a screenshot and send it to me on Discord: @Melty1000**

Seriously - I put a lot of love into this project and nothing makes me happier than seeing people enjoy it! 🎄✨

### Where to Find Me

[![Discord](https://img.shields.io/badge/Discord-@Melty1000-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8EfuxXgVyT)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support_Me-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/melty1000)
[![Twitch](https://img.shields.io/badge/Twitch-melty1000-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://www.twitch.tv/melty1000)
[![YouTube](https://img.shields.io/badge/YouTube-@melty__1000-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@melty_1000)
[![GitHub](https://img.shields.io/badge/GitHub-Melty1000-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Melty1000)
[![X](https://img.shields.io/badge/X-@melty1000-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/melty1000)

---

## 🐛 Found a Bug?

Things acting weird? Let me know!

Hit me up on **Discord: @Melty1000** with:
- What went wrong
- What browser you're using
- A screenshot if possible

---

## 🎄 Happy Holidays!

May your streams be bright and your lights be twinkling! ✨🎅❄️

*Made with ❤️, caffeine, and way too many late nights by Melty*
