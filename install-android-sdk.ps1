# Android SDK Installation Script for Bubblewrap
# Run this script as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Android SDK Installation Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

# Configuration
$ANDROID_HOME = "C:\Android"
$SDK_TOOLS_URL = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$SDK_TOOLS_ZIP = "$env:TEMP\android-commandlinetools.zip"
$SDK_TOOLS_DIR = "$ANDROID_HOME\cmdline-tools"

Write-Host "Step 1: Creating Android directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $ANDROID_HOME | Out-Null
New-Item -ItemType Directory -Force -Path "$SDK_TOOLS_DIR\latest" | Out-Null

Write-Host "Step 2: Downloading Android Command Line Tools..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray

try {
    Invoke-WebRequest -Uri $SDK_TOOLS_URL -OutFile $SDK_TOOLS_ZIP -UseBasicParsing
    Write-Host "Download complete!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to download SDK tools" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    pause
    exit 1
}

Write-Host "Step 3: Extracting SDK tools..." -ForegroundColor Yellow
try {
    Expand-Archive -Path $SDK_TOOLS_ZIP -DestinationPath "$SDK_TOOLS_DIR\temp" -Force
    
    # Move files to correct structure
    $tempBin = Get-ChildItem "$SDK_TOOLS_DIR\temp" -Recurse -Filter "sdkmanager.bat" | Select-Object -First 1
    if ($tempBin) {
        $sourceDir = $tempBin.Directory.Parent
        Move-Item -Path "$sourceDir\*" -Destination "$SDK_TOOLS_DIR\latest\" -Force
        Remove-Item -Path "$SDK_TOOLS_DIR\temp" -Recurse -Force
    }
    
    Write-Host "Extraction complete!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to extract SDK tools" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    pause
    exit 1
}

Write-Host "Step 4: Setting up environment variables..." -ForegroundColor Yellow

# Add to PATH
$sdkManagerPath = "$SDK_TOOLS_DIR\latest\bin"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($currentPath -notlike "*$sdkManagerPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$sdkManagerPath", "Machine")
    Write-Host "Added SDK tools to PATH" -ForegroundColor Green
} else {
    Write-Host "SDK tools already in PATH" -ForegroundColor Gray
}

# Set ANDROID_HOME
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $ANDROID_HOME, "Machine")
$env:ANDROID_HOME = $ANDROID_HOME
Write-Host "Set ANDROID_HOME to $ANDROID_HOME" -ForegroundColor Green

Write-Host ""
Write-Host "Step 5: Refreshing environment variables..." -ForegroundColor Yellow
Write-Host "Please close and reopen PowerShell for PATH changes to take effect." -ForegroundColor Yellow
Write-Host ""

# Refresh PATH in current session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "Step 6: Accepting Android licenses..." -ForegroundColor Yellow
Write-Host "You'll need to press 'y' for each license agreement" -ForegroundColor Gray
Write-Host ""

try {
    & "$sdkManagerPath\sdkmanager.bat" --licenses
    Write-Host "Licenses accepted!" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Could not accept licenses automatically" -ForegroundColor Yellow
    Write-Host "You may need to run: sdkmanager --licenses manually" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 7: Installing required SDK components..." -ForegroundColor Yellow
Write-Host "This will install:" -ForegroundColor Gray
Write-Host "  - Android SDK Build-Tools 35.0.0" -ForegroundColor Gray
Write-Host "  - Android SDK Platform 35" -ForegroundColor Gray
Write-Host "  - Platform Tools" -ForegroundColor Gray
Write-Host "This may take several minutes..." -ForegroundColor Gray
Write-Host ""

try {
    & "$sdkManagerPath\sdkmanager.bat" "build-tools;35.0.0" "platforms;android-35" "platform-tools"
    Write-Host ""
    Write-Host "SDK components installed successfully!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to install SDK components" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "You can try installing manually:" -ForegroundColor Yellow
    Write-Host "  sdkmanager `"build-tools;35.0.0`" `"platforms;android-35`" `"platform-tools`"" -ForegroundColor Yellow
    pause
    exit 1
}

# Clean up
Remove-Item -Path $SDK_TOOLS_ZIP -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Close and reopen PowerShell (to refresh PATH)" -ForegroundColor White
Write-Host "2. Verify installation: sdkmanager --version" -ForegroundColor White
Write-Host "3. Go to your project: cd C:\Users\LEEROY\Pictures\quantfrontnow" -ForegroundColor White
Write-Host "4. Retry build: bubblewrap build --release" -ForegroundColor White
Write-Host ""
Write-Host "SDK Location: $ANDROID_HOME" -ForegroundColor Gray
Write-Host ""

pause

