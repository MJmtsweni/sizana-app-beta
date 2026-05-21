# Sizana Mobile App - Local Setup Guide 📱

Welcome to the Sizana mobile app repository! This guide will walk you through exactly how to get the app running on your own computer and phone so you can test it. **You do not need to be a developer to do this.** Just follow these steps in order.

## Phase 1: Download the Required Software
Before we touch the code, you need three standard pieces of software installed on your computer, and one app on your phone.

1. **Visual Studio Code (VS Code):** This is the program we use to view the code. 
   * Download it here: [https://code.visualstudio.com/](https://code.visualstudio.com/) and install it using the default settings.
2. **Node.js:** This is the engine that runs our app on your computer. It automatically includes a tool called `npm` (Node Package Manager) which downloads our app's puzzle pieces.
   * Download the **LTS (Long Term Support)** version here: [https://nodejs.org/](https://nodejs.org/) and install it using the default settings.
3. **Git:** This connects your computer to GitHub to download the code.
   * Download it here: [https://git-scm.com/downloads](https://git-scm.com/downloads) and install it using the default settings (just keep clicking "Next").
4. **Expo Go (On your phone):** This is an app that lets you run our mobile code directly on your personal phone without plugging it into your computer.
   * Search for **"Expo Go"** in the Apple App Store or Google Play Store and install it.

---

## Phase 2: Download the Code
1. Open your computer's native terminal:
   * **Windows:** Press the Start button, type `cmd`, and press Enter.
   * **Mac:** Press `Cmd + Space`, type `Terminal`, and press Enter.
2. Copy the following command, paste it into the terminal, and press Enter:
   ```bash
   git clone [https://github.com/MJmtsweni/sizana-app-beta.git](https://github.com/MJmtsweni/sizana-app-beta.git)

---
Phase 3: Run the App

    Open VS Code.

    Click File > Open Folder... (or Open on Mac) and select the sizana-app folder you just downloaded.

    At the very top of the VS Code screen, click Terminal > New Terminal. A small text window will open at the bottom of your screen.

    Click inside that bottom terminal window, type the following command, and press Enter:
1. npm install
(Wait a minute or two. This tells the computer to download all the necessary background files. You only have to do this the very first time).
2. npx expo start

---
A QR Code will appear in your terminal.

    If you have an iPhone: Open your normal Camera app, point it at the QR code on your screen, and tap the yellow "Open in Expo Go" button that pops up.

    If you have an Android: Open the Expo Go app you downloaded earlier and tap "Scan QR Code".

Congratulations! The Sizana app is now running live on your phone. Troubleshooting: Make sure your phone and your computer are connected to the exact same Wi-Fi network, or the QR code won't load.
