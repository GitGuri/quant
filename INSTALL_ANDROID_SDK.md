# Install Android SDK Command Line Tools

## Step 1: Download Android Command Line Tools

1. Go to: https://developer.android.com/studio#command-tools
2. Scroll down to "Command line tools only"
3. Download: **Windows** version (zip file)
   - File name: `commandlinetools-win-XXXXXX_latest.zip`
4. Save it to a location like: `C:\Android\` (create this folder if needed)

## Step 2: Extract and Set Up

1. Extract the zip file to: `C:\Android\cmdline-tools\`
2. Inside should be a folder like `cmdline-tools\bin\`
3. Create a folder structure:
   ```
   C:\Android\cmdline-tools\
   └── latest\
       └── bin\
           ├── sdkmanager.bat
           └── (other tools)
   ```

   So the structure should be: `C:\Android\cmdline-tools\latest\bin\sdkmanager.bat`

## Step 3: Set Environment Variables

1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Go to **Advanced** tab
3. Click **Environment Variables**
4. Under **System variables**, find **Path**, click **Edit**
5. Click **New** and add:
   ```
   C:\Android\cmdline-tools\latest\bin
   ```
6. Also add (create if doesn't exist):
   ```
   C:\Android\platform-tools
   ```
7. Click **OK** on all dialogs
8. **Restart your terminal/PowerShell** for changes to take effect

## Step 4: Accept Android Licenses

Open PowerShell and run:

```powershell
sdkmanager --licenses
```

Press `y` to accept all licenses.

## Step 5: Install Required SDK Components

Run these commands:

```powershell
# Install Build Tools 35
sdkmanager "build-tools;35.0.0"

# Install Android Platform 35 (or 36 if available)
sdkmanager "platforms;android-35"

# Also install platform-tools (for adb)
sdkmanager "platform-tools"
```

## Step 6: Set ANDROID_HOME Environment Variable

1. In **Environment Variables** (same as Step 3)
2. Under **System variables**, click **New**
3. Variable name: `ANDROID_HOME`
4. Variable value: `C:\Android`
5. Click **OK**

## Step 7: Verify Installation

Restart PowerShell and test:

```powershell
sdkmanager --version
```

Should show version number.

## Step 8: Retry Bubblewrap Build

After SDK is installed:

```powershell
cd C:\Users\LEEROY\Pictures\quantfrontnow
bubblewrap build --release
```

