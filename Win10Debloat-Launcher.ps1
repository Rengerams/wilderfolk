<#
.SYNOPSIS
    Windows 10 focused launcher, planner and tweak companion for Win11Debloat.

.DESCRIPTION
    Downloads, verifies and runs the Win11Debloat toolkit while adding a Windows 10 first
    workflow:
      * Windows 10 detection with a curated map of Windows 11 only switches that are
        removed (and explained) instead of being forwarded to a Win10 machine.
      * A local Windows 10 tweak catalog (privacy, shell, gaming) with presets, automatic
        value backup and a clean -RevertWin10Tweaks path.
      * -WhatIf planning that shows what will run, download and change.
      * Download retries with backoff, proxy support, optional SHA-256 pinning and an
        offline bundle mode (zip, folder or already extracted tree).
      * Preflight checks, elevated self-relaunch, conflict detection, launch logging and a
        run summary with drop reasons and tweak results.
      * Startup item management for the Run keys and Startup folders, driven by
        -StartupItems or the Config\StartupItems.json file, with -ListStartupItems,
        -RevertStartupItems and full previous-state backup.
      * Standalone -Diagnostics, -CheckUpdate, -ListTweaks, -ListStartupItems, -Uninstall
        and scheduled task installation.

.PARAMETER Win10Safe
    Plan for Windows 10 even when the host is not Windows 10. Win11-only switches are
    dropped and tweak compatibility is evaluated against -TargetBuild.

.PARAMETER IgnoreCompatibility
    Forward every switch untouched, including switches Windows 10 does not have.

.PARAMETER Version
    Upstream release tag to run, for example '2.9.2' or 'v2.9.2'. Defaults to latest.

.PARAMETER Channel
    'Stable' (latest release) or 'Dev' (master branch).

.PARAMETER BundlePath
    Offline source: a zip archive, a folder containing Win11Debloat.ps1, or an extracted
    release tree. No network access is used when this is supplied.

.PARAMETER Sha256
    Expected SHA-256 of the downloaded archive. The download is rejected on mismatch.

.PARAMETER Proxy
    Proxy URI passed to the download commands.

.PARAMETER Retries
    Download attempts before giving up (0-10, default 3).

.PARAMETER TimeoutSec
    Per-attempt download timeout in seconds.

.PARAMETER Preset
    Apply a Windows 10 tweak preset: Privacy, Tidy, Gaming or All.

.PARAMETER Win10Tweaks
    One or more tweak ids from -ListTweaks, for example 'DisableCortana,HidePeopleBar'.

.PARAMETER RevertWin10Tweaks
    Restore the registry values recorded by the previous tweak run.

.PARAMETER ListTweaks
    Print the tweak catalog and exit.

.PARAMETER Diagnostics
    Print an OS, storage and tuning state report and exit.

.PARAMETER CheckUpdate
    Report the upstream release that would be downloaded and exit.

.PARAMETER Uninstall
    Remove the working folder (script files, configs, logs, backups) and the scheduled
    task if one was installed.

.PARAMETER InstallScheduledTask
    Register a scheduled task that reruns the saved settings.

.PARAMETER TweaksOnly
    Apply the requested Windows 10 tweaks without downloading or running Win11Debloat.

.PARAMETER LauncherConfig
    JSON file whose property names are switch names (for example
    { "DisableTelemetry": true, "Preset": "Privacy" }).

.PARAMETER KeepFiles
    Keep downloaded and extracted script files after the run.

.PARAMETER NoElevate
    Do not relaunch elevated. Changes that need admin will fail.

.PARAMETER StartupItems
    Names of startup items to disable, taken from -ListStartupItems. Accepts a
    comma-separated list and wildcards such as '*Teams*'. Registry Run values are removed
    after their previous state is saved; Startup folder shortcuts are moved into the
    launcher Config folder. Revert with -RevertStartupItems. When nothing is passed, a
    StartupItems.json file in the Config folder is used if one exists.

.PARAMETER ListStartupItems
    Print the startup items found in the Run keys and Startup folders, showing where each
    one starts from, then exit. Use the printed names with -StartupItems.

.PARAMETER RevertStartupItems
    Restore every startup item removed by the previous -StartupItems run and empty the
    saved backup.

.PARAMETER Verbose
    Print each launcher step with extra detail and write it to the launcher log.
    Forwarded to Win11Debloat as its own verbose switch.

.PARAMETER WhatIf
    Print the plan and change nothing: no download, no registry write, no file move.

.PARAMETER Dev
    Shortcut for -Channel Dev. Runs Win11Debloat from the master branch instead of a
    release.

.PARAMETER CLI
    Run Win11Debloat in its console interface instead of the graphical one.

.PARAMETER Silent
    Suppress launcher console output. Warnings and failures are still logged.

.PARAMETER Sysprep
    Prepare the machine for imaging. Win11Debloat uses its Sysprep-safe mode and skips
    changes that would not survive a captured image.

.PARAMETER LogPath
    File that Win11Debloat writes its own log to. The launcher always logs separately
    under the work folder.

.PARAMETER User
    Account whose per-user settings are changed. Defaults to the signed-in user.

.PARAMETER SkipExplorerRestart
    Do not restart Explorer when the run finishes, so the desktop does not flicker. Also
    available as -NoRestartExplorer.

.PARAMETER CreateRestorePoint
    Create a System Restore point before any change is made.

.PARAMETER SkipRegistryBackup
    Do not export the registry values Win11Debloat is about to change.

.PARAMETER RunDefaults
    Run Win11Debloat's standard default selection.

.PARAMETER RunDefaultsLite
    Run the lighter default selection, which leaves more Windows features enabled.

.PARAMETER RunSavedSettings
    Reuse the settings saved by a previous Win11Debloat run. Used by the scheduled task.

.PARAMETER Config
    Win11Debloat's own JSON configuration file. This is separate from -LauncherConfig.

.PARAMETER Apps
    Comma-separated app names for -RemoveApps, for example 'Microsoft.BingWeather'.

.PARAMETER AppRemovalTarget
    Removal scope for the apps: 'CurrentUser' or 'AllUsers'.

.PARAMETER RemoveApps
    Remove the apps named with -Apps.

.PARAMETER RemoveGamingApps
    Remove the Xbox and other gaming apps.

.PARAMETER RemoveHPApps
    Remove the preinstalled HP apps. Only meaningful on HP machines.

.PARAMETER ForceRemoveEdge
    Force the removal of Microsoft Edge.

.PARAMETER DisableDVR
    Disable the Game DVR background recorder.

.PARAMETER DisableGameBarIntegration
    Disable the Game Bar integration in Windows.

.PARAMETER EnableWindowsSandbox
    Enable the Windows Sandbox optional feature.

.PARAMETER EnableWindowsSubsystemForLinux
    Enable the Windows Subsystem for Linux optional feature.

.PARAMETER DisableTelemetry
    Disable telemetry, diagnostics and the related data collection settings.

.PARAMETER DisableSearchHistory
    Stop Start search from keeping a local history.

.PARAMETER DisableFastStartup
    Disable Fast Startup, so a shutdown really shuts the machine down.

.PARAMETER DisableBitlockerAutoEncryption
    Stop Windows from encrypting new drives with BitLocker automatically.

.PARAMETER DisableModernStandbyNetworking
    Keep the network connection off while the device is in Modern Standby.

.PARAMETER DisableNotifications
    Disable notification toasts, tips and suggestions.

.PARAMETER DisableStorageSense
    Disable Storage Sense automatic cleanup.

.PARAMETER DisableUpdateASAP
    Stop Windows from installing updates as soon as they are released.

.PARAMETER PreventUpdateAutoReboot
    Prevent Windows from restarting on its own to finish an update.

.PARAMETER DisableDeliveryOptimization
    Disable peer-to-peer update delivery to other computers.

.PARAMETER DisableDeviceAutoAppDownload
    Stop Windows from downloading manufacturer apps and device companion software.

.PARAMETER DisableBing
    Disable Bing and web results in Start menu search.

.PARAMETER DisableStoreSearchSuggestions
    Disable the search suggestions shown in the Microsoft Store.

.PARAMETER DisableDesktopSpotlight
    Disable Windows Spotlight desktop backgrounds.

.PARAMETER HideDesktopSpotlightIcon
    Hide the Spotlight desktop icon without changing the wallpaper source.

.PARAMETER EnableDesktopSpotlight
    Turn Windows Spotlight desktop backgrounds back on.

.PARAMETER DisableLockscreenTips
    Disable the tips, fun facts and promotions shown on the lock screen.

.PARAMETER DisableSuggestions
    Disable the Windows tips and suggested content across the shell.

.PARAMETER DisableLocationServices
    Disable Windows location services.

.PARAMETER DisableFindMyDevice
    Disable the Find My Device tracking feature.

.PARAMETER DisableEdgeAds
    Disable the promotional content and ads in Microsoft Edge.

.PARAMETER DisableBraveBloat
    Disable the promotional content bundled with Brave.

.PARAMETER DisableSettings365Ads
    Disable the Microsoft 365 ads in the Settings app.

.PARAMETER DisableSettingsHome
    Disable the recommendations on the Settings home page.

.PARAMETER ShowHiddenFolders
    Show hidden files, folders and drives in Explorer.

.PARAMETER ShowKnownFileExt
    Always show known file name extensions in Explorer.

.PARAMETER HideDupliDrive
    Hide duplicate drives from the Explorer navigation pane.

.PARAMETER EnableDarkMode
    Use the dark theme for Windows and apps.

.PARAMETER DisableTransparency
    Disable the transparency effects of the shell.

.PARAMETER DisableAnimations
    Disable window animations and other shell effects.

.PARAMETER TaskbarAlignLeft
    Align the taskbar icons to the left, as on Windows 10.

.PARAMETER CombineTaskbarAlways
    Always combine taskbar buttons for the same app.

.PARAMETER CombineTaskbarWhenFull
    Combine taskbar buttons only when the taskbar is full.

.PARAMETER CombineTaskbarNever
    Never combine taskbar buttons, so every window gets its own button.

.PARAMETER CombineMMTaskbarAlways
    Always combine the buttons on the secondary monitor taskbars.

.PARAMETER CombineMMTaskbarWhenFull
    Combine secondary monitor buttons only when that taskbar is full.

.PARAMETER CombineMMTaskbarNever
    Never combine the buttons on the secondary monitor taskbars.

.PARAMETER MMTaskbarModeAll
    Show the taskbar on every display.

.PARAMETER MMTaskbarModeMainActive
    Show the taskbar on the main display and the active display only.

.PARAMETER MMTaskbarModeActive
    Show the taskbar on the active display only.

.PARAMETER HideSearchTb
    Hide the search box from the taskbar.

.PARAMETER ShowSearchIconTb
    Show the taskbar search as an icon only.

.PARAMETER ShowSearchLabelTb
    Show the taskbar search as an icon with a label.

.PARAMETER ShowSearchBoxTb
    Show the full taskbar search box.

.PARAMETER HideTaskview
    Hide the Task View button from the taskbar.

.PARAMETER DisableStartRecommended
    Disable the Recommended section of the Start menu.

.PARAMETER DisableStartAllApps
    Hide the all-apps list from the Start menu.

.PARAMETER StartAllAppsCategory
    Show the all-apps list grouped by category.

.PARAMETER StartAllAppsGrid
    Show the all-apps list as a grid.

.PARAMETER StartAllAppsList
    Show the all-apps list as a single list.

.PARAMETER DisableStartPhoneLink
    Remove the Phone Link entry from the Start menu.

.PARAMETER DisableCopilot
    Disable Windows Copilot.

.PARAMETER DisableRecall
    Disable Recall snapshots. Windows 11 24H2 and newer only.

.PARAMETER DisableClickToDo
    Disable the Click To Do AI helper. Windows 11 24H2 and newer only.

.PARAMETER DisableAISvcAutoStart
    Stop the Windows AI service from starting automatically.

.PARAMETER DisablePaintAI
    Remove the AI features from Paint.

.PARAMETER DisableNotepadAI
    Remove the AI features from Notepad.

.PARAMETER DisableEdgeAI
    Disable the AI features in Microsoft Edge.

.PARAMETER DisableSearchHighlights
    Disable the search highlights shown in Start search.

.PARAMETER DisableWidgets
    Disable the Widgets board and its taskbar button.

.PARAMETER HideChat
    Hide the Chat and Teams icon from the taskbar.

.PARAMETER EnableEndTask
    Enable the End task entry in the taskbar right-click menu.

.PARAMETER EnableLastActiveClick
    Clicking a taskbar icon switches to the last active window of that app.

.PARAMETER ClearStart
    Reset the current user's Start layout to the Windows default.

.PARAMETER ReplaceStart
    Apply a Start layout JSON file for the current user.

.PARAMETER ClearStartAllUsers
    Reset the Start layout for every user account.

.PARAMETER ReplaceStartAllUsers
    Apply a Start layout JSON file for every user account.

.PARAMETER RevertContextMenu
    Restore the Windows 10 style right-click context menu. Windows 11 only.

.PARAMETER DisableDragTray
    Disable the drag-to-taskbar tray behaviour.

.PARAMETER DisableMouseAcceleration
    Disable mouse pointer acceleration, for linear pointer movement.

.PARAMETER DisableStickyKeys
    Disable the Sticky Keys keyboard shortcut prompt.

.PARAMETER DisableWindowSnapping
    Disable dragging a window to a screen edge to snap it.

.PARAMETER DisableSnapAssist
    Disable Snap Assist, which offers the remaining windows after a snap.

.PARAMETER DisableSnapLayouts
    Disable the Snap Layouts flyout on the maximize button.

.PARAMETER HideTabsInAltTab
    Alt+Tab shows windows only, never browser or app tabs.

.PARAMETER Show3TabsInAltTab
    Alt+Tab shows up to three tabs per app before listing windows.

.PARAMETER Show5TabsInAltTab
    Alt+Tab shows up to five tabs per app before listing windows.

.PARAMETER Show20TabsInAltTab
    Alt+Tab shows up to twenty tabs per app before listing windows.

.PARAMETER HideHome
    Hide Home from the Explorer navigation pane.

.PARAMETER HideGallery
    Hide Gallery from the Explorer navigation pane. Windows 11 only.

.PARAMETER ExplorerToHome
    Open Explorer at Home.

.PARAMETER ExplorerToThisPC
    Open Explorer at This PC.

.PARAMETER ExplorerToDownloads
    Open Explorer at the Downloads folder.

.PARAMETER ExplorerToOneDrive
    Open Explorer at OneDrive.

.PARAMETER AddFoldersToThisPC
    Show the user folders under This PC in the navigation pane.

.PARAMETER HideOnedrive
    Hide OneDrive from the Explorer navigation pane.

.PARAMETER Hide3dObjects
    Hide the 3D Objects folder.

.PARAMETER HideMusic
    Hide the Music folder.

.PARAMETER HideIncludeInLibrary
    Hide 'Include in library' from the folder context menu.

.PARAMETER HideGiveAccessTo
    Hide 'Give access to' from the folder context menu.

.PARAMETER HideShare
    Hide 'Share' from the folder context menu.

.PARAMETER ShowDriveLettersFirst
    Show drive letters before drive names.

.PARAMETER ShowDriveLettersLast
    Show drive letters after drive names.

.PARAMETER ShowNetworkDriveLettersFirst
    Show drive letters before drive names for network drives only.

.PARAMETER HideDriveLetters
    Hide drive letters entirely.

.PARAMETER WorkPath
    Folder the launcher downloads and runs Win11Debloat from. Defaults to
    %TEMP%\Win11Debloat. Config, logs and backups live here.

.PARAMETER TargetBuild
    Windows 10 build used as the compatibility reference when the host is not Windows 10,
    for example 19045 (22H2). Defaults to 19045.

.PARAMETER TaskName
    Name of the scheduled task created by -InstallScheduledTask and removed by
    -Uninstall. Defaults to 'Win10Debloat Maintenance'.

.PARAMETER TaskTime
    Daily start time of the scheduled task, as 'HH:mm'. Defaults to 03:00.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -WhatIf -Preset Privacy

    Shows the Windows 10 plan, the switches that would be dropped and the tweaks that
    would be written, without touching the machine.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -Win10Safe -Preset Tidy -RunDefaultsLite

    Windows 10 focused run: tidy tweaks plus the light debloat defaults.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -Diagnostics

    Read-only report of build, storage, pending reboot and current tweak values.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -ListStartupItems

    Lists every startup item with the location it starts from. The printed names are the
    ones -StartupItems accepts.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -StartupItems 'OneDrive,*Teams*' -TweaksOnly

    Disables the OneDrive startup entry and every Teams startup entry, saving their
    previous state, without downloading Win11Debloat.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -TweaksOnly

    Applies the startup item list from the work folder Config\StartupItems.json, shaped
    { "StartupItems": [ "OneDrive", "Spotify" ] }, with no other selection.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -RevertStartupItems

    Puts back every startup item the previous run disabled.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -InstallScheduledTask -TaskTime 04:30

    Registers a daily SYSTEM task at 04:30 that replays the saved settings.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -BundlePath .\win11debloat.zip -Sha256 <hash> -Silent

    Installs from a local archive after verifying the hash, with no console output.

.EXAMPLE
    .\Win10Debloat-Launcher.ps1 -Win10Safe -WhatIf -RunDefaults

    Shows the Windows 10 plan for the full default run without changing anything.

.NOTES
    Exit codes: 0 success, 1 unexpected error, 2 preflight failure, 3 download failure,
    4 elevation failure, 5 unsupported operating system, 6 invalid configuration.
    A non-zero exit code from Win11Debloat itself is propagated unchanged.
#>

#Requires -Version 5.1

param (
    [switch]$Verbose,
    [switch]$WhatIf,
    [switch]$Dev,
    [switch]$CLI,
    [switch]$Silent,
    [switch]$Sysprep,
    [string]$LogPath,
    [string]$User,
    [Alias('NoRestartExplorer')]
    [switch]$SkipExplorerRestart,
    [switch]$CreateRestorePoint,
    [switch]$SkipRegistryBackup,
    [switch]$RunDefaults,
    [switch]$RunDefaultsLite,
    [switch]$RunSavedSettings,
    [string]$Config,
    [string]$Apps,
    [string]$AppRemovalTarget,
    [switch]$RemoveApps,
    [switch]$RemoveGamingApps,
    [switch]$RemoveHPApps,
    [switch]$ForceRemoveEdge,
    [switch]$DisableDVR,
    [switch]$DisableGameBarIntegration,
    [switch]$EnableWindowsSandbox,
    [switch]$EnableWindowsSubsystemForLinux,
    [switch]$DisableTelemetry,
    [switch]$DisableSearchHistory,
    [switch]$DisableFastStartup,
    [switch]$DisableBitlockerAutoEncryption,
    [switch]$DisableModernStandbyNetworking,
    [switch]$DisableNotifications,
    [switch]$DisableStorageSense,
    [switch]$DisableUpdateASAP,
    [switch]$PreventUpdateAutoReboot,
    [switch]$DisableDeliveryOptimization,
    [switch]$DisableDeviceAutoAppDownload,
    [switch]$DisableBing,
    [switch]$DisableStoreSearchSuggestions,
    [switch]$DisableDesktopSpotlight,
    [switch]$HideDesktopSpotlightIcon,
    [switch]$EnableDesktopSpotlight,
    [switch]$DisableLockscreenTips,
    [switch]$DisableSuggestions,
    [switch]$DisableLocationServices,
    [switch]$DisableFindMyDevice,
    [switch]$DisableEdgeAds,
    [switch]$DisableBraveBloat,
    [switch]$DisableSettings365Ads,
    [switch]$DisableSettingsHome,
    [switch]$ShowHiddenFolders,
    [switch]$ShowKnownFileExt,
    [switch]$HideDupliDrive,
    [switch]$EnableDarkMode,
    [switch]$DisableTransparency,
    [switch]$DisableAnimations,
    [switch]$TaskbarAlignLeft,
    [switch]$CombineTaskbarAlways, [switch]$CombineTaskbarWhenFull, [switch]$CombineTaskbarNever,
    [switch]$CombineMMTaskbarAlways, [switch]$CombineMMTaskbarWhenFull, [switch]$CombineMMTaskbarNever,
    [switch]$MMTaskbarModeAll, [switch]$MMTaskbarModeMainActive, [switch]$MMTaskbarModeActive,
    [switch]$HideSearchTb, [switch]$ShowSearchIconTb, [switch]$ShowSearchLabelTb, [switch]$ShowSearchBoxTb,
    [switch]$HideTaskview,
    [switch]$DisableStartRecommended,
    [switch]$DisableStartAllApps, [switch]$StartAllAppsCategory, [switch]$StartAllAppsGrid, [switch]$StartAllAppsList,
    [switch]$DisableStartPhoneLink,
    [switch]$DisableCopilot,
    [switch]$DisableRecall,
    [switch]$DisableClickToDo,
    [switch]$DisableAISvcAutoStart,
    [switch]$DisablePaintAI,
    [switch]$DisableNotepadAI,
    [switch]$DisableEdgeAI,
    [switch]$DisableSearchHighlights,
    [switch]$DisableWidgets,
    [switch]$HideChat,
    [switch]$EnableEndTask,
    [switch]$EnableLastActiveClick,
    [switch]$ClearStart,
    [string]$ReplaceStart,
    [switch]$ClearStartAllUsers,
    [string]$ReplaceStartAllUsers,
    [switch]$RevertContextMenu,
    [switch]$DisableDragTray,
    [switch]$DisableMouseAcceleration,
    [switch]$DisableStickyKeys,
    [switch]$DisableWindowSnapping,
    [switch]$DisableSnapAssist,
    [switch]$DisableSnapLayouts,
    [switch]$HideTabsInAltTab, [switch]$Show3TabsInAltTab, [switch]$Show5TabsInAltTab, [switch]$Show20TabsInAltTab,
    [switch]$HideHome,
    [switch]$HideGallery,
    [switch]$ExplorerToHome,
    [switch]$ExplorerToThisPC,
    [switch]$ExplorerToDownloads,
    [switch]$ExplorerToOneDrive,
    [switch]$AddFoldersToThisPC,
    [switch]$HideOnedrive,
    [switch]$Hide3dObjects,
    [switch]$HideMusic,
    [switch]$HideIncludeInLibrary,
    [switch]$HideGiveAccessTo,
    [switch]$HideShare,
    [switch]$ShowDriveLettersFirst,
    [switch]$ShowDriveLettersLast,
    [switch]$ShowNetworkDriveLettersFirst,
    [switch]$HideDriveLetters,

    # ---- Launcher options (never forwarded to Win11Debloat) ----
    [string]$Version,
    [ValidateSet('Stable', 'Dev')]
    [string]$Channel = 'Stable',
    [string]$BundlePath,
    [string]$WorkPath,
    [string]$Proxy,
    [string]$Sha256,
    [ValidateRange(0, 10)]
    [int]$Retries = 3,
    [ValidateRange(10, 900)]
    [int]$TimeoutSec = 120,
    [int]$TargetBuild = 19045,
    [switch]$Win10Safe,
    [switch]$IgnoreCompatibility,
    [ValidateSet('Privacy', 'Tidy', 'Gaming', 'All')]
    [string]$Preset,
    [string[]]$Win10Tweaks,
    [string[]]$StartupItems,
    [switch]$ListStartupItems,
    [switch]$RevertStartupItems,
    [switch]$RevertWin10Tweaks,
    [switch]$TweaksOnly,
    [switch]$ListTweaks,
    [switch]$Diagnostics,
    [switch]$CheckUpdate,
    [switch]$Uninstall,
    [switch]$InstallScheduledTask,
    [string]$TaskName = 'Win10Debloat Maintenance',
    [string]$TaskTime = '03:00',
    [string]$LauncherConfig,
    [switch]$KeepFiles,
    [switch]$NoElevate
)

$script:LauncherVersion = '2.0.0'
$script:ScriptName = 'Win10Debloat-Launcher'

$script:ExitSuccess = 0
$script:ExitError = 1
$script:ExitPreflight = 2
$script:ExitDownload = 3
$script:ExitElevation = 4
$script:ExitUnsupported = 5
$script:ExitConfig = 6

$script:PreservedFolders = @('Config', 'Logs', 'Backups', 'Profiles')
$script:StashedFolders = @('Config', 'Backups', 'Profiles')
$script:Step = 0
$script:LogFile = $null
$script:DryRun = $false
$script:KnownParameters = $null
# Captured here: inside a function $PSBoundParameters describes that function, not this script.
$script:LauncherBoundParameters = $PSBoundParameters

# Switches owned by this launcher; everything else is forwarded to Win11Debloat.
$script:LauncherOnlyParameters = @(
    'Dev', 'Version', 'Channel', 'BundlePath', 'WorkPath', 'Proxy', 'Sha256',
    'Retries', 'TimeoutSec', 'TargetBuild', 'Win10Safe', 'IgnoreCompatibility',
    'Preset', 'Win10Tweaks', 'StartupItems', 'ListStartupItems', 'RevertStartupItems',
    'RevertWin10Tweaks', 'TweaksOnly', 'ListTweaks',
    'Diagnostics', 'CheckUpdate', 'Uninstall', 'InstallScheduledTask', 'TaskName',
    'TaskTime', 'LauncherConfig', 'KeepFiles', 'NoElevate'
)

# Startup item state lives in the Config folder so it survives a bundle refresh.
$script:StartupConfigFile = 'StartupItems.json'
$script:StartupBackupFile = 'StartupItems-backup.json'
$script:StartupDisabledFolder = 'StartupItems-disabled'

# ---------------------------------------------------------------------------
# Output and logging
# ---------------------------------------------------------------------------

function Write-LauncherLog {
    param([string]$Message, [string]$Level = 'INFO')

    if (-not $script:LogFile) { return }
    try {
        $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
        Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8
    }
    catch {
        $script:LogFile = $null
    }
}

function Write-Step {
    param([string]$Text)

    $script:Step++
    Write-LauncherLog ('[{0}] {1}' -f $script:Step, $Text)
    if ($Silent) { return }
    Write-Host ''
    Write-Host ('[{0}] {1}' -f $script:Step, $Text) -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Text)

    Write-LauncherLog $Text
    if ($Silent) { return }
    Write-Host $Text
}

function Write-Warn {
    param([string]$Text)

    Write-LauncherLog $Text 'WARN'
    Write-Host ('  ! ' + $Text) -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Text)

    Write-LauncherLog $Text 'ERROR'
    Write-Host ('  x ' + $Text) -ForegroundColor Red
}

function Write-Success {
    param([string]$Text)

    Write-LauncherLog $Text
    if ($Silent) { return }
    Write-Host ('  + ' + $Text) -ForegroundColor Green
}

function Wait-ForUserExit {
    if ($Silent) { return }
    if (-not [Environment]::UserInteractive) { return }
    Write-Host ''
    Write-Host 'Press enter to exit...'
    Read-Host | Out-Null
}

# ---------------------------------------------------------------------------
# Environment helpers
# ---------------------------------------------------------------------------

function Get-WindowsReleaseClass {
    param([int]$Build)

    if ($Build -ge 22000) { return 'Windows11' }
    if ($Build -ge 10240) { return 'Windows10' }
    return 'Unsupported'
}

function Test-Administrator {
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch {
        return $false
    }
}

function Get-OperatingSystemInfo {
    $info = [ordered]@{
        Caption = 'Unknown'
        Version = '0.0'
        Build = 0
        UBR = 0
        DisplayVersion = ''
        Class = 'Unsupported'
        IsAdmin = $false
        Supported = $false
    }

    if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
        return [pscustomobject]$info
    }

    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
        $info.Caption = $os.Caption
        $info.Version = $os.Version
        $info.Build = [int]$os.BuildNumber
    }
    catch {
        try {
            $os = Get-WmiObject -Class Win32_OperatingSystem -ErrorAction Stop
            $info.Caption = $os.Caption
            $info.Version = $os.Version
            $info.Build = [int]$os.BuildNumber
        }
        catch {
            $info.Build = [Environment]::OSVersion.Version.Build
        }
    }

    try {
        $release = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction Stop
        if ($null -ne $release.UBR) { $info.UBR = [int]$release.UBR }
        if ($release.DisplayVersion) { $info.DisplayVersion = [string]$release.DisplayVersion }
        elseif ($release.ReleaseId) { $info.DisplayVersion = [string]$release.ReleaseId }
    }
    catch { }

    $info.Class = Get-WindowsReleaseClass -Build $info.Build
    $info.IsAdmin = Test-Administrator
    $info.Supported = ($info.Class -ne 'Unsupported')
    return [pscustomobject]$info
}

function Get-FreeSpaceMb {
    param([string]$Path = $env:TEMP)

    try {
        $root = [System.IO.Path]::GetPathRoot($Path)
        $driveName = $root.TrimEnd('\', ':')
        $drive = Get-PSDrive -Name $driveName -ErrorAction Stop
        return [math]::Round($drive.Free / 1MB, 0)
    }
    catch {
        return -1
    }
}

function Test-PendingReboot {
    $flags = @()
    if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') {
        $flags += 'Windows Update'
    }
    try {
        $pending = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction Stop
        if ($pending.PendingFileRenameOperations) { $flags += 'pending file rename' }
    }
    catch { }
    if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') {
        $flags += 'component servicing'
    }
    return $flags
}

function Test-TcpEndpoint {
    param([string]$Target, [int]$Port = 443, [int]$TimeoutMs = 4000)

    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($Target, $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { return $false }
        $client.EndConnect($async)
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $client) { $client.Close() }
    }
}

function Set-Tls12 {
    if ($PSVersionTable.PSVersion.Major -lt 6) {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        }
        catch { }
    }
}

function New-DirectoryIfMissing {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path) { return }
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Windows 10 compatibility map
# ---------------------------------------------------------------------------

function Get-Win10SwitchGap {
    $gap = [ordered]@{}
    $gap['TaskbarAlignLeft'] = 'The Windows 10 taskbar is always left aligned'
    $gap['CombineMMTaskbarAlways'] = 'Per-monitor taskbar combining is Windows 11 only'
    $gap['CombineMMTaskbarWhenFull'] = 'Per-monitor taskbar combining is Windows 11 only'
    $gap['CombineMMTaskbarNever'] = 'Per-monitor taskbar combining is Windows 11 only'
    $gap['MMTaskbarModeAll'] = 'Multi-monitor taskbar modes are Windows 11 only'
    $gap['MMTaskbarModeMainActive'] = 'Multi-monitor taskbar modes are Windows 11 only'
    $gap['MMTaskbarModeActive'] = 'Multi-monitor taskbar modes are Windows 11 only'
    $gap['HideChat'] = 'The Chat taskbar icon is a Windows 11 feature'
    $gap['EnableEndTask'] = 'End task in the taskbar needs Windows 11 22H2 or newer'
    $gap['EnableLastActiveClick'] = 'Last active click is a Windows 11 taskbar setting'
    $gap['DisableStartRecommended'] = 'Windows 11 Start recommendations do not exist on Windows 10'
    $gap['DisableStartAllApps'] = 'Windows 10 has a fixed all-apps list'
    $gap['StartAllAppsCategory'] = 'Windows 10 has a fixed all-apps list'
    $gap['StartAllAppsGrid'] = 'Windows 10 has a fixed all-apps list'
    $gap['StartAllAppsList'] = 'Windows 10 has a fixed all-apps list'
    $gap['DisableStartPhoneLink'] = 'Phone Link in Start is Windows 11 only'
    $gap['ClearStart'] = 'Pin layout editing targets the Windows 11 Start menu'
    $gap['ReplaceStart'] = 'Pin layout editing targets the Windows 11 Start menu'
    $gap['ClearStartAllUsers'] = 'Pin layout editing targets the Windows 11 Start menu'
    $gap['ReplaceStartAllUsers'] = 'Pin layout editing targets the Windows 11 Start menu'
    $gap['HideTabsInAltTab'] = 'Alt+Tab tab modes are Windows 11 only'
    $gap['Show3TabsInAltTab'] = 'Alt+Tab tab modes are Windows 11 only'
    $gap['Show5TabsInAltTab'] = 'Alt+Tab tab modes are Windows 11 only'
    $gap['Show20TabsInAltTab'] = 'Alt+Tab tab modes are Windows 11 only'
    $gap['HideHome'] = 'Explorer Home is Windows 11 only'
    $gap['HideGallery'] = 'Explorer Gallery is Windows 11 only'
    $gap['ExplorerToHome'] = 'Explorer Home is Windows 11 only'
    $gap['DisableDesktopSpotlight'] = 'Desktop Spotlight is Windows 11 only'
    $gap['HideDesktopSpotlightIcon'] = 'Desktop Spotlight is Windows 11 only'
    $gap['EnableDesktopSpotlight'] = 'Desktop Spotlight is Windows 11 only'
    $gap['DisableWidgets'] = 'The Widgets board is Windows 11 only'
    $gap['DisableSettingsHome'] = 'The Settings Home page is Windows 11 only'
    $gap['DisableSettings365Ads'] = 'Microsoft 365 Settings ads are Windows 11 only'
    $gap['DisableCopilot'] = 'Windows Copilot is Windows 11 only'
    $gap['DisableRecall'] = 'Recall is Windows 11 24H2 only'
    $gap['DisableClickToDo'] = 'Click to Do is Windows 11 24H2 only'
    $gap['DisableAISvcAutoStart'] = 'The Windows AI service is Windows 11 only'
    $gap['DisablePaintAI'] = 'Paint AI features are Windows 11 only'
    $gap['DisableNotepadAI'] = 'Notepad AI features are Windows 11 only'
    $gap['DisableSearchHighlights'] = 'Search highlights are Windows 11 only'
    $gap['DisableModernStandbyNetworking'] = 'Modern standby networking is Windows 11 only'
    return $gap
}

function Split-CompatibleSwitch {
    param(
        [System.Collections.IDictionary]$Parameters,
        [switch]$Windows10
    )

    $kept = @{}
    $dropped = @()

    if (-not $Windows10) {
        foreach ($key in $Parameters.Keys) { $kept[$key] = $Parameters[$key] }
        return [pscustomobject]@{ Kept = $kept; Dropped = $dropped }
    }

    $gap = Get-Win10SwitchGap
    foreach ($key in $Parameters.Keys) {
        if ($gap.Contains($key)) {
            $dropped += [pscustomobject]@{ Name = $key; Reason = $gap[$key] }
        }
        else {
            $kept[$key] = $Parameters[$key]
        }
    }
    return [pscustomobject]@{ Kept = $kept; Dropped = $dropped }
}

function Test-SwitchConflict {
    param([System.Collections.IDictionary]$Parameters)

    $groups = @(
        @{ Label = 'Taskbar button combining'; Keys = @('CombineTaskbarAlways', 'CombineTaskbarWhenFull', 'CombineTaskbarNever') }
        @{ Label = 'Per-monitor taskbar combining'; Keys = @('CombineMMTaskbarAlways', 'CombineMMTaskbarWhenFull', 'CombineMMTaskbarNever') }
        @{ Label = 'Per-monitor taskbar mode'; Keys = @('MMTaskbarModeAll', 'MMTaskbarModeMainActive', 'MMTaskbarModeActive') }
        @{ Label = 'Taskbar search style'; Keys = @('HideSearchTb', 'ShowSearchIconTb', 'ShowSearchLabelTb', 'ShowSearchBoxTb') }
        @{ Label = 'Start all-apps layout'; Keys = @('DisableStartAllApps', 'StartAllAppsCategory', 'StartAllAppsGrid', 'StartAllAppsList') }
        @{ Label = 'Explorer landing page'; Keys = @('ExplorerToHome', 'ExplorerToThisPC', 'ExplorerToDownloads', 'ExplorerToOneDrive') }
        @{ Label = 'Drive letter ordering'; Keys = @('ShowDriveLettersFirst', 'ShowDriveLettersLast', 'ShowNetworkDriveLettersFirst', 'HideDriveLetters') }
        @{ Label = 'Alt+Tab tab count'; Keys = @('HideTabsInAltTab', 'Show3TabsInAltTab', 'Show5TabsInAltTab', 'Show20TabsInAltTab') }
        @{ Label = 'Desktop Spotlight'; Keys = @('DisableDesktopSpotlight', 'HideDesktopSpotlightIcon', 'EnableDesktopSpotlight') }
    )

    $problems = @()
    foreach ($group in $groups) {
        $selected = @($group.Keys | Where-Object { $Parameters.Contains($_) -and $Parameters[$_] })
        if ($selected.Count -gt 1) {
            $problems += ('{0}: keep only one of {1}' -f $group.Label, ($selected -join ', '))
        }
    }
    return $problems
}

# ---------------------------------------------------------------------------
# Argument building
# ---------------------------------------------------------------------------

function ConvertTo-ArgumentList {
    param(
        [System.Collections.IDictionary]$Parameters,
        [string[]]$Exclude
    )

    $parts = @()
    $keys = @($Parameters.Keys | Sort-Object)
    foreach ($key in $keys) {
        if ($Exclude -contains $key) { continue }

        $value = $Parameters[$key]
        if ($value -is [System.Management.Automation.SwitchParameter]) {
            if ($value.IsPresent) { $parts += ('-' + $key) }
            continue
        }
        if ($value -is [bool]) {
            if ($value) { $parts += ('-' + $key) }
            continue
        }
        if ($null -eq $value) { continue }

        if ($value -is [array]) {
            $text = (($value | ForEach-Object { [string]$_ }) -join ',')
        }
        else {
            $text = [string]$value
        }
        if ($text.Length -eq 0) { continue }
        $text = $text.Replace('"', '""')
        $parts += ('-{0} "{1}"' -f $key, $text)
    }
    return ($parts -join ' ')
}

function Get-KnownParameterName {
    if ($null -ne $script:KnownParameters) { return $script:KnownParameters }

    try {
        $command = Get-Command -Name $PSCommandPath -ErrorAction Stop
        $script:KnownParameters = @($command.Parameters.Keys)
    }
    catch {
        $script:KnownParameters = @()
    }
    return $script:KnownParameters
}

function Import-LauncherSettings {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Launcher config not found: $Path"
    }

    $json = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    $known = Get-KnownParameterName
    $settings = @{}
    $unknown = @()

    foreach ($property in $json.PSObject.Properties) {
        $name = $property.Name.TrimStart('-')
        if ($known.Count -gt 0 -and $known -notcontains $name) {
            $unknown += $property.Name
            continue
        }
        $settings[$name] = $property.Value
    }

    return [pscustomobject]@{ Settings = $settings; Unknown = $unknown }
}

# ---------------------------------------------------------------------------
# Windows 10 tweak catalog
# ---------------------------------------------------------------------------

function Get-Win10TweakCatalog {
    return @(
        @{
            Id = 'DisableCortana'
            Label = 'Disable Cortana'
            Detail = 'Blocks the Cortana assistant through policy.'
            Presets = @('Privacy')
            Writes = @(
                @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search'; Name = 'AllowCortana'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'HideCortanaButton'
            Label = 'Hide the Cortana button'
            Detail = 'Removes the Cortana entry from the taskbar search area.'
            Presets = @('Privacy', 'Tidy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'; Name = 'ShowCortanaButton'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableWebSearch'
            Label = 'Disable web results in Start search'
            Detail = 'Keeps Start search local instead of querying Bing.'
            Presets = @('Privacy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search'; Name = 'BingSearchEnabled'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search'; Name = 'CortanaConsent'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableTimeline'
            Label = 'Disable Timeline and activity history'
            Detail = 'Stops Windows collecting and publishing activity history.'
            Presets = @('Privacy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'; Name = 'EnableActivityFeed'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'; Name = 'PublishUserActivities'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'; Name = 'UploadUserActivities'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableSuggestions'
            Label = 'Disable Start and Settings suggestions'
            Detail = 'Turns off app suggestions, tips and suggested content.'
            Presets = @('Privacy', 'Tidy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; Name = 'SubscribedContent-338388Enabled'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; Name = 'SubscribedContent-338389Enabled'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; Name = 'SubscribedContent-353694Enabled'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; Name = 'SubscribedContent-353696Enabled'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; Name = 'SystemPaneSuggestionsEnabled'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; Name = 'SoftLandingEnabled'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableFeedback'
            Label = 'Disable Windows feedback prompts'
            Detail = 'Stops the periodic feedback request popups.'
            Presets = @('Privacy', 'Tidy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Siuf\Rules'; Name = 'NumberOfSIUFInPeriod'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKCU:\Software\Microsoft\Siuf\Rules'; Name = 'PeriodInNanoSeconds'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableAdvertisingId'
            Label = 'Reset the advertising id'
            Detail = 'Opts the user out of the per-user advertising identifier.'
            Presets = @('Privacy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo'; Name = 'Enabled'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableBackgroundApps'
            Label = 'Disable background apps'
            Detail = 'Stops store apps running in the background for this user.'
            Presets = @('Privacy', 'Gaming')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications'; Name = 'GlobalUserDisabled'; Type = 'DWord'; Value = 1 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search'; Name = 'BackgroundAppGlobalToggle'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableSettingsSync'
            Label = 'Disable settings sync'
            Detail = 'Stops theme, password and preference sync to the Microsoft account.'
            Presets = @('Privacy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\SettingSync\SyncPolicy'; Name = 'DisableSettingSync'; Type = 'DWord'; Value = 2 }
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\SettingSync\SyncPolicy'; Name = 'DisableSettingSyncUserOverride'; Type = 'DWord'; Value = 1 }
            )
        }
        @{
            Id = 'DisableLocationTracking'
            Label = 'Deny app location access'
            Detail = 'Sets the machine-wide app location consent to deny.'
            Presets = @('Privacy')
            Writes = @(
                @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location'; Name = 'Value'; Type = 'String'; Value = 'Deny' }
            )
        }
        @{
            Id = 'DisableRemoteAssistance'
            Label = 'Disable Remote Assistance'
            Detail = 'Stops unsolicited Remote Assistance invitations.'
            Presets = @('Privacy')
            Writes = @(
                @{ Path = 'HKLM:\SYSTEM\CurrentControlSet\Control\Remote Assistance'; Name = 'fAllowToGetHelp'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'HidePeopleBar'
            Label = 'Hide the People button'
            Detail = 'Removes the People icon from the taskbar.'
            Presets = @('Tidy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'; Name = 'PeopleBand'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'HideMeetNow'
            Label = 'Hide Meet Now'
            Detail = 'Removes the Meet Now icon from the notification area.'
            Presets = @('Tidy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer'; Name = 'HideSCAMeetNow'; Type = 'DWord'; Value = 1 }
            )
        }
        @{
            Id = 'HideNewsAndInterests'
            Label = 'Hide News and interests'
            Detail = 'Hides the taskbar weather and news widget (21H1 and newer).'
            Presets = @('Tidy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Feeds'; Name = 'ShellFeedsTaskbarViewMode'; Type = 'DWord'; Value = 2 }
            )
        }
        @{
            Id = 'DisableStartupDelay'
            Label = 'Remove the startup app delay'
            Detail = 'Skips the artificial pause before startup apps launch.'
            Presets = @('Tidy', 'Gaming')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize'; Name = 'StartupDelayInMSec'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableAutoplay'
            Label = 'Disable AutoPlay'
            Detail = 'Stops AutoPlay prompts for removable media.'
            Presets = @('Tidy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\AutoplayHandlers'; Name = 'DisableAutoplay'; Type = 'DWord'; Value = 1 }
            )
        }
        @{
            Id = 'DisableGameDVR'
            Label = 'Disable Game DVR capture'
            Detail = 'Turns off background game recording for this user and the machine.'
            Presets = @('Gaming')
            Writes = @(
                @{ Path = 'HKCU:\System\GameConfigStore'; Name = 'GameDVR_Enabled'; Type = 'DWord'; Value = 0 }
                @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR'; Name = 'AllowGameDVR'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableFastStartup'
            Label = 'Disable Fast Startup'
            Detail = 'Uses a full shutdown so dual boot and driver changes behave predictably.'
            Presets = @('Gaming')
            Writes = @(
                @{ Path = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power'; Name = 'HiberbootEnabled'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'SetHighPerformancePowerPlan'
            Label = 'Use the High performance power plan'
            Detail = 'Switches the active power plan to the built-in High performance scheme.'
            Presets = @('Gaming')
            Action = 'HighPerformancePowerPlan'
            Writes = @()
        }
        @{
            Id = 'DisableSuperfetch'
            Label = 'Disable SysMain (SuperFetch)'
            Detail = 'Stops the SysMain service; opt-in because it is a matter of taste on SSDs.'
            Presets = @()
            Reboot = $true
            Writes = @(
                @{ Path = 'HKLM:\SYSTEM\CurrentControlSet\Services\SysMain'; Name = 'Start'; Type = 'DWord'; Value = 4 }
            )
        }
        @{
            Id = 'DisableDeliveryOptimization'
            Label = 'Disable Delivery Optimization downloads'
            Detail = 'Prevents Windows sharing update content with other PCs.'
            Presets = @('Privacy')
            Writes = @(
                @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization'; Name = 'DODownloadMode'; Type = 'DWord'; Value = 0 }
            )
        }
        @{
            Id = 'DisableMouseAcceleration'
            Label = 'Disable mouse acceleration'
            Detail = 'Turns off enhanced pointer precision.'
            Presets = @('Gaming')
            Writes = @(
                @{ Path = 'HKCU:\Control Panel\Mouse'; Name = 'MouseSpeed'; Type = 'String'; Value = '0' }
                @{ Path = 'HKCU:\Control Panel\Mouse'; Name = 'MouseThreshold1'; Type = 'String'; Value = '0' }
                @{ Path = 'HKCU:\Control Panel\Mouse'; Name = 'MouseThreshold2'; Type = 'String'; Value = '0' }
            )
        }
        @{
            Id = 'DisableStickyKeysShortcut'
            Label = 'Disable the Sticky Keys shortcut'
            Detail = 'Stops the five-tap Shift prompt during play.'
            Presets = @('Gaming')
            Writes = @(
                @{ Path = 'HKCU:\Control Panel\Accessibility\StickyKeys'; Name = 'Flags'; Type = 'String'; Value = '506' }
            )
        }
        @{
            Id = 'ShowSecondsInClock'
            Label = 'Show seconds in the clock'
            Detail = 'Adds seconds to the taskbar clock.'
            Presets = @()
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'; Name = 'ShowSecondsInSystemClock'; Type = 'DWord'; Value = 1 }
            )
        }
        @{
            Id = 'DisableSearchBoxHighlights'
            Label = 'Remove taskbar search highlights'
            Detail = 'Stops the taskbar search box showing rotating highlights.'
            Presets = @('Tidy')
            Writes = @(
                @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\SearchSettings'; Name = 'IsDynamicSearchBoxEnabled'; Type = 'DWord'; Value = 0 }
            )
        }
    )
}

function Select-Win10Tweak {
    param(
        [string[]]$Ids,
        [string]$PresetName
    )

    $catalog = Get-Win10TweakCatalog
    $selected = @()
    $unknown = @()
    $seen = @{}

    foreach ($tweak in $catalog) {
        if (-not $PresetName) { break }
        $wanted = ($PresetName -eq 'All') -or ($tweak.Presets -contains $PresetName)
        if ($wanted -and -not $seen.ContainsKey($tweak.Id)) {
            $selected += $tweak
            $seen[$tweak.Id] = $true
        }
    }

    foreach ($raw in @($Ids)) {
        foreach ($piece in ([string]$raw).Split(',')) {
            $id = $piece.Trim()
            if ($id.Length -eq 0) { continue }
            $match = @($catalog | Where-Object { $_.Id -eq $id })
            if ($match.Count -eq 0) {
                $unknown += $id
                continue
            }
            if (-not $seen.ContainsKey($id)) {
                $selected += $match[0]
                $seen[$id] = $true
            }
        }
    }

    return [pscustomobject]@{ Selected = $selected; Unknown = $unknown }
}

function Get-TweakWrite {
    param($Tweak)

    $writes = @()
    if ($null -ne $Tweak.Writes) {
        foreach ($write in $Tweak.Writes) { $writes += $write }
    }
    return $writes
}

# ---------------------------------------------------------------------------
# Registry helpers
# ---------------------------------------------------------------------------

function Get-RegistrySnapshot {
    param([string]$Path, [string]$Name)

    $snapshot = [ordered]@{
        Path = $Path
        Name = $Name
        Existed = $false
        Type = 'String'
        Value = $null
        BinaryBase64 = $false
    }

    try {
        $key = Get-Item -LiteralPath $Path -ErrorAction Stop
        $value = $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if ($null -ne $value) {
            $snapshot.Existed = $true
            $snapshot.Type = [string]$key.GetValueKind($Name)
            if ($value -is [byte[]]) {
                $snapshot.BinaryBase64 = $true
                $snapshot.Value = [Convert]::ToBase64String($value)
            }
            else {
                $snapshot.Value = $value
            }
        }
    }
    catch { }

    return [pscustomobject]$snapshot
}

function Set-RegistryValue {
    param(
        [string]$Path,
        [string]$Name,
        [string]$Type,
        $Value
    )

    if ($script:DryRun) { return }
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -Path $Path -Force | Out-Null
    }

    $propertyType = 'String'
    switch ($Type) {
        'DWord' { $propertyType = 'DWord' }
        'QWord' { $propertyType = 'QWord' }
        'Binary' { $propertyType = 'Binary' }
        'ExpandString' { $propertyType = 'ExpandString' }
        'MultiString' { $propertyType = 'MultiString' }
        'String' { $propertyType = 'String' }
    }

    New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $propertyType -Force | Out-Null
}

function Remove-RegistryValue {
    param([string]$Path, [string]$Name)

    if ($script:DryRun) { return }
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Remove-ItemProperty -Path $Path -Name $Name -Force -ErrorAction SilentlyContinue
}

function Format-RegistryValue {
    param($Snapshot)

    if (-not $Snapshot.Existed) { return '(not set)' }
    if ($null -eq $Snapshot.Value) { return '(empty)' }
    return [string]$Snapshot.Value
}

# ---------------------------------------------------------------------------
# Tweak backup, apply and revert
# ---------------------------------------------------------------------------

function Invoke-Win10Tweak {
    param(
        $Tweak,
        [System.Collections.ArrayList]$BackupCollector
    )

    foreach ($write in (Get-TweakWrite -Tweak $Tweak)) {
        $snapshot = Get-RegistrySnapshot -Path $write.Path -Name $write.Name
        if ($null -ne $BackupCollector) { $BackupCollector.Add($snapshot) | Out-Null }
        Set-RegistryValue -Path $write.Path -Name $write.Name -Type $write.Type -Value $write.Value
    }

    if ($Tweak.Action -eq 'HighPerformancePowerPlan' -and -not $script:DryRun) {
        & powercfg.exe /setactive SCHEME_MIN 2>$null | Out-Null
    }
}

function Save-Win10TweakBackup {
    param([System.Collections.ArrayList]$Entries, [string]$Path)

    if ($null -eq $Entries -or $Entries.Count -eq 0) { return }
    New-DirectoryIfMissing -Path (Split-Path -Parent $Path)
    ($Entries | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Restore-Win10TweakBackup {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return 0 }

    $entries = @(Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
    $restored = 0
    foreach ($entry in $entries) {
        if ($entry.Existed) {
            $value = $entry.Value
            if ($entry.BinaryBase64) { $value = [Convert]::FromBase64String([string]$entry.Value) }
            Set-RegistryValue -Path $entry.Path -Name $entry.Name -Type $entry.Type -Value $value
        }
        else {
            Remove-RegistryValue -Path $entry.Path -Name $entry.Name
        }
        $restored++
    }
    return $restored
}

# ---------------------------------------------------------------------------
# Startup items (Run keys and Startup folders)
# ---------------------------------------------------------------------------

function Get-StartupLocation {
    $locations = @(
        @{ Kind = 'Registry'; Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' }
        @{ Kind = 'Registry'; Path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' }
        @{ Kind = 'Registry'; Path = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run' }
    )

    $startMenu = 'Microsoft\Windows\Start Menu\Programs\Startup'
    if ($env:APPDATA) { $locations += @{ Kind = 'Folder'; Path = (Join-Path $env:APPDATA $startMenu) } }
    if ($env:ProgramData) { $locations += @{ Kind = 'Folder'; Path = (Join-Path $env:ProgramData $startMenu) } }

    return $locations
}

function Get-StartupEntry {
    $entries = @()

    foreach ($location in (Get-StartupLocation)) {
        if (-not (Test-Path -LiteralPath $location.Path)) { continue }

        if ($location.Kind -eq 'Registry') {
            $key = Get-Item -LiteralPath $location.Path -ErrorAction SilentlyContinue
            if ($null -eq $key) { continue }
            foreach ($name in @($key.GetValueNames())) {
                if ([string]::IsNullOrWhiteSpace($name)) { continue }
                $entries += [pscustomobject]@{
                    Name     = $name
                    Kind     = 'Registry'
                    Location = $location.Path
                    FileName = $null
                    Command  = [string]$key.GetValue($name, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                }
            }
            continue
        }

        foreach ($file in @(Get-ChildItem -LiteralPath $location.Path -File -ErrorAction SilentlyContinue)) {
            if ($file.Name -eq 'desktop.ini') { continue }
            $entries += [pscustomobject]@{
                Name     = $file.BaseName
                Kind     = 'File'
                Location = $location.Path
                FileName = $file.Name
                Command  = $file.FullName
            }
        }
    }

    return $entries
}

function Get-StartupEntrySource {
    param($Entry)

    if ($Entry.Kind -eq 'Registry') {
        if ($Entry.Location -like '*WOW6432Node*') { return 'HKLM Run (32-bit)' }
        if ($Entry.Location -like 'HKCU:*') { return 'HKCU Run' }
        return 'HKLM Run'
    }
    if ($Entry.Location -like '*ProgramData*') { return 'All users Startup folder' }
    return 'User Startup folder'
}

function Select-StartupItem {
    param([string[]]$Names)

    $available = @(Get-StartupEntry)
    $selected = @()
    $unknown = @()
    $seen = @{}

    foreach ($raw in @($Names)) {
        foreach ($piece in ([string]$raw).Split(',')) {
            $name = $piece.Trim()
            if ($name.Length -eq 0) { continue }

            $candidates = @($available | Where-Object { $_.Name -eq $name })
            if ($candidates.Count -eq 0 -and $name -match '[*?]') {
                $candidates = @($available | Where-Object { $_.Name -like $name })
            }
            if ($candidates.Count -eq 0) {
                $unknown += $name
                continue
            }

            foreach ($match in $candidates) {
                $key = '{0}|{1}|{2}' -f $match.Kind, $match.Location, $match.Name
                if ($seen.ContainsKey($key)) { continue }
                $seen[$key] = $true
                $selected += $match
            }
        }
    }

    return [pscustomobject]@{ Selected = $selected; Unknown = $unknown }
}

function Import-StartupItemConfig {
    param([string]$Path)

    $json = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ($null -eq $json) { return @() }
    if ($json -is [string]) { return @([string]$json) }
    if ($json -is [System.Array]) { return @($json) }

    $property = $json.PSObject.Properties['StartupItems']
    if ($null -ne $property) { return @($property.Value) }

    throw 'Startup config needs a StartupItems array, for example { "StartupItems": [ "OneDrive" ] }.'
}

function Disable-StartupItem {
    param(
        $Entry,
        [System.Collections.ArrayList]$BackupCollector,
        [string]$DisabledFolder
    )

    if ($Entry.Kind -eq 'Registry') {
        $snapshot = Get-RegistrySnapshot -Path $Entry.Location -Name $Entry.Name
        if ($null -ne $BackupCollector) {
            $BackupCollector.Add([pscustomobject]@{
                Kind         = 'Registry'
                Path         = $Entry.Location
                Name         = $Entry.Name
                Type         = $snapshot.Type
                Existed      = $snapshot.Existed
                Value        = $snapshot.Value
                BinaryBase64 = $snapshot.BinaryBase64
                StoredPath   = $null
            }) | Out-Null
        }
        Remove-RegistryValue -Path $Entry.Location -Name $Entry.Name
        return
    }

    if ($script:DryRun) { return }

    $source = Join-Path $Entry.Location $Entry.FileName
    if (-not (Test-Path -LiteralPath $source)) { return }

    New-DirectoryIfMissing -Path $DisabledFolder
    $target = Join-Path $DisabledFolder $Entry.FileName
    Move-Item -LiteralPath $source -Destination $target -Force

    if ($null -ne $BackupCollector) {
        $BackupCollector.Add([pscustomobject]@{
            Kind         = 'File'
            Path         = $Entry.Location
            Name         = $Entry.FileName
            Type         = $null
            Existed      = $true
            Value        = $null
            BinaryBase64 = $false
            StoredPath   = $target
        }) | Out-Null
    }
}

function Save-StartupItemBackup {
    param([System.Collections.ArrayList]$Entries, [string]$Path)

    if ($null -eq $Entries -or $Entries.Count -eq 0) { return }
    New-DirectoryIfMissing -Path (Split-Path -Parent $Path)
    ($Entries | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Restore-StartupItemBackup {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return 0 }

    $entries = @(Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
    $restored = 0

    foreach ($entry in $entries) {
        if ($entry.Kind -eq 'Registry') {
            if ($entry.Existed) {
                $value = $entry.Value
                if ($entry.BinaryBase64) { $value = [Convert]::FromBase64String([string]$entry.Value) }
                Set-RegistryValue -Path $entry.Path -Name $entry.Name -Type $entry.Type -Value $value
            }
            else {
                Remove-RegistryValue -Path $entry.Path -Name $entry.Name
            }
            $restored++
            continue
        }

        if (-not $entry.StoredPath -or -not (Test-Path -LiteralPath $entry.StoredPath)) { continue }
        Move-Item -LiteralPath $entry.StoredPath -Destination (Join-Path $entry.Path $entry.Name) -Force
        $restored++
    }

    return $restored
}

function Show-StartupItems {
    param([string]$WorkRoot)

    $entries = @(Get-StartupEntry)
    $configPath = Join-Path (Join-Path $WorkRoot 'Config') $script:StartupConfigFile

    Write-Host ''
    Write-Host ('Startup items (launcher {0}):' -f $script:LauncherVersion)
    Write-Host '-----------------------------------------------------------------'

    if ($entries.Count -eq 0) {
        Write-Host '  No startup items found in the Run keys or Startup folders.'
    }
    foreach ($entry in $entries) {
        Write-Host ('  {0,-34} {1}' -f $entry.Name, (Get-StartupEntrySource -Entry $entry))
    }

    Write-Host ''
    Write-Host 'Disable : -StartupItems "OneDrive,Spotify"   or   -StartupItems "*Teams*"'
    Write-Host 'Restore : -RevertStartupItems'
    Write-Host ('Config  : {0}' -f $configPath)
    Write-Host '          { "StartupItems": [ "OneDrive", "Spotify" ] }'
}

# ---------------------------------------------------------------------------
# Download and bundle handling
# ---------------------------------------------------------------------------

function Resolve-BundleUri {
    param([string]$ReleaseTag, [string]$ReleaseChannel)

    if ($ReleaseTag) {
        $tag = $ReleaseTag.Trim()
        if (-not $tag.StartsWith('v')) { $tag = 'v' + $tag }
        return ('https://github.com/Raphire/Win11Debloat/archive/refs/tags/{0}.zip' -f $tag)
    }

    if ($ReleaseChannel -eq 'Dev') {
        return 'https://github.com/Raphire/Win11Debloat/archive/refs/heads/master.zip'
    }

    $headers = @{ 'User-Agent' = ('{0}/{1}' -f $script:ScriptName, $script:LauncherVersion) }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/Raphire/Win11Debloat/releases/latest' -Headers $headers
    return $release.zipball_url
}

function Invoke-BundleDownload {
    param(
        [string]$Uri,
        [string]$Destination,
        [int]$Attempts,
        [int]$TimeoutSeconds
    )

    $webParameters = @{
        Uri = $Uri
        OutFile = $Destination
        UseBasicParsing = $true
        TimeoutSec = $TimeoutSeconds
        ErrorAction = 'Stop'
    }
    if ($Proxy) { $webParameters['Proxy'] = $Proxy }

    $attempt = 0
    $delay = 2
    while ($attempt -le $Attempts) {
        try {
            Invoke-WebRequest @webParameters
            if (-not (Test-Path -LiteralPath $Destination)) { throw 'Download produced no file.' }
            $length = (Get-Item -LiteralPath $Destination).Length
            if ($length -lt 1024) { throw ('Downloaded file is too small ({0} bytes).' -f $length) }
            return $true
        }
        catch {
            $message = $_.Exception.Message
            if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue }
            $attempt++
            if ($attempt -gt $Attempts) {
                Write-LauncherLog ('Download failed after {0} attempts: {1}' -f ($Attempts + 1), $message) 'ERROR'
                return $false
            }
            Write-Warn ('Download attempt {0} failed ({1}). Retrying in {2}s.' -f $attempt, $message, $delay)
            Start-Sleep -Seconds $delay
            $delay = [math]::Min($delay * 2, 30)
        }
    }
    return $false
}

function Test-ArchiveHash {
    param([string]$ArchivePath, [string]$Expected)

    if (-not $Expected) { return $true }

    $actual = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
    if ($actual -ne $Expected.Trim()) {
        Write-Fail ('SHA-256 mismatch. Expected {0}, got {1}.' -f $Expected.Trim(), $actual)
        return $false
    }
    Write-Success 'Archive SHA-256 verified.'
    return $true
}

function Expand-BundleArchive {
    param([string]$ArchivePath, [string]$Destination)

    New-DirectoryIfMissing -Path $Destination

    try {
        Expand-Archive -LiteralPath $ArchivePath -DestinationPath $Destination -Force -ErrorAction Stop
    }
    catch {
        Write-Warn ('Expand-Archive failed ({0}); using the .NET extractor.' -f $_.Exception.Message)
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath, $Destination)
    }
}

function Install-Bundle {
    param(
        [string]$SourcePath,
        [string]$Destination,
        [string]$ExpectedHash
    )

    if (-not (Test-Path -LiteralPath $SourcePath)) {
        throw "Bundle source not found: $SourcePath"
    }

    $item = Get-Item -LiteralPath $SourcePath
    if ($item.PSIsContainer) {
        New-DirectoryIfMissing -Path $Destination
        Copy-Item -Path (Join-Path $item.FullName '*') -Destination $Destination -Recurse -Force
        return
    }

    if ($item.Extension -ne '.zip') {
        throw "Bundle source must be a .zip archive or a folder: $SourcePath"
    }

    if (-not (Test-ArchiveHash -ArchivePath $item.FullName -Expected $ExpectedHash)) {
        throw 'Archive verification failed.'
    }

    Expand-BundleArchive -ArchivePath $item.FullName -Destination $Destination
}

function Move-ExtractedBundle {
    param([string]$WorkRoot)

    $inner = Get-ChildItem -LiteralPath $WorkRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'Win11Debloat-*' } |
        Select-Object -First 1

    if ($null -eq $inner) { return }

    Get-ChildItem -LiteralPath $inner.FullName -Force | Move-Item -Destination $WorkRoot -Force
    Remove-Item -LiteralPath $inner.FullName -Recurse -Force
}

# ---------------------------------------------------------------------------
# Working folder maintenance
# ---------------------------------------------------------------------------

function Clear-WorkDirectory {
    param([string]$WorkRoot)

    if (-not (Test-Path -LiteralPath $WorkRoot)) { return }

    Get-ChildItem -LiteralPath $WorkRoot -Force -ErrorAction SilentlyContinue |
        Where-Object { $script:PreservedFolders -notcontains $_.Name } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

function Save-PreservedData {
    param([string]$WorkRoot, [string]$StashRoot)

    $saved = @()
    foreach ($folder in $script:StashedFolders) {
        $source = Join-Path $WorkRoot $folder
        if (-not (Test-Path -LiteralPath $source)) { continue }
        New-DirectoryIfMissing -Path $StashRoot
        Move-Item -LiteralPath $source -Destination (Join-Path $StashRoot $folder) -Force
        $saved += $folder
    }
    return $saved
}

function Restore-PreservedData {
    param([string]$WorkRoot, [string]$StashRoot)

    if (-not (Test-Path -LiteralPath $StashRoot)) { return }

    foreach ($item in (Get-ChildItem -LiteralPath $StashRoot -Force)) {
        $target = Join-Path $WorkRoot $item.Name
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue }
        Move-Item -LiteralPath $item.FullName -Destination $target -Force
    }
    Remove-Item -LiteralPath $StashRoot -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# Standalone actions
# ---------------------------------------------------------------------------

function Show-TweakCatalog {
    Write-Host ''
    Write-Host ('Windows 10 tweak catalog (launcher {0}):' -f $script:LauncherVersion)
    Write-Host '-----------------------------------------------------------------'

    foreach ($tweak in (Get-Win10TweakCatalog)) {
        $presets = 'opt-in'
        if ($tweak.Presets.Count -gt 0) { $presets = $tweak.Presets -join ', ' }
        Write-Host ('  {0,-30} {1}' -f $tweak.Id, $tweak.Label)
        Write-Host ('  {0,-30} presets: {1}' -f '', $presets)
        Write-Host ('  {0,-30} {1}' -f '', $tweak.Detail)
        Write-Host ''
    }

    Write-Host 'Presets: Privacy, Tidy, Gaming, All'
    Write-Host 'Usage:   -Preset Privacy   or   -Win10Tweaks DisableCortana,HidePeopleBar'
}

function Show-Diagnostics {
    $os = Get-OperatingSystemInfo
    $freeMb = Get-FreeSpaceMb -Path $env:TEMP
    $reboot = @(Test-PendingReboot)

    Write-Host ''
    Write-Host ('{0} {1}' -f $script:ScriptName, $script:LauncherVersion)
    Write-Host '-----------------------------------------------------------------'
    Write-Host ('OS              : {0}' -f $os.Caption)
    Write-Host ('Version / build : {0} (build {1}.{2})' -f $os.Version, $os.Build, $os.UBR)
    Write-Host ('Release class   : {0} {1}' -f $os.Class, $os.DisplayVersion)
    Write-Host ('PowerShell      : {0}' -f $PSVersionTable.PSVersion.ToString())
    Write-Host ('Elevated        : {0}' -f $os.IsAdmin)
    Write-Host ('Temp free space : {0} MB' -f $freeMb)
    if ($reboot.Count -gt 0) {
        Write-Host ('Pending reboot  : {0}' -f ($reboot -join ', '))
    }
    else {
        Write-Host 'Pending reboot  : none detected'
    }

    Write-Host ''
    Write-Host 'Current Windows 10 tweak values:'
    foreach ($tweak in (Get-Win10TweakCatalog)) {
        $writes = @(Get-TweakWrite -Tweak $tweak)
        if ($writes.Count -eq 0) {
            Write-Host ('  {0,-30} action: {1}' -f $tweak.Id, $tweak.Action)
            continue
        }
        $first = $writes[0]
        $snapshot = Get-RegistrySnapshot -Path $first.Path -Name $first.Name
        Write-Host ('  {0,-30} {1}' -f $tweak.Id, (Format-RegistryValue -Snapshot $snapshot))
    }

    Write-Host ''
    Write-Host 'Switches Windows 10 does not support:'
    $gap = Get-Win10SwitchGap
    foreach ($name in $gap.Keys) {
        Write-Host ('  {0,-30} {1}' -f $name, $gap[$name])
    }
    Write-Host ''
}

function Show-UpstreamRelease {
    Set-Tls12
    $headers = @{ 'User-Agent' = ('{0}/{1}' -f $script:ScriptName, $script:LauncherVersion) }

    try {
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/Raphire/Win11Debloat/releases/latest' -Headers $headers
    }
    catch {
        Write-Fail ('Could not query the upstream release: {0}' -f $_.Exception.Message)
        return $false
    }

    Write-Host ''
    Write-Host ('Launcher version : {0}' -f $script:LauncherVersion)
    Write-Host ('Upstream release : {0}  ({1})' -f $release.tag_name, $release.published_at)
    Write-Host ('Archive          : {0}' -f $release.zipball_url)
    Write-Host 'Run without -Version to use this release.'
    Write-Host ''
    return $true
}

function Remove-LauncherData {
    param([string]$WorkRoot)

    $removed = @()

    $task = $null
    if (Get-Command -Name Get-ScheduledTask -ErrorAction SilentlyContinue) {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    }
    if ($null -ne $task) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        $removed += ('scheduled task "{0}"' -f $TaskName)
    }

    if (Test-Path -LiteralPath $WorkRoot) {
        Remove-Item -LiteralPath $WorkRoot -Recurse -Force -ErrorAction SilentlyContinue
        if (-not (Test-Path -LiteralPath $WorkRoot)) { $removed += $WorkRoot }
    }

    return $removed
}

function Install-DebloatScheduledTask {
    param([string]$Name, [string]$Time)

    $launcher = $PSCommandPath
    if (-not $launcher) { throw 'Cannot resolve the launcher path for scheduling.' }

    $parsed = [datetime]::MinValue
    if (-not [datetime]::TryParse($Time, [ref]$parsed)) {
        throw "TaskTime must be a time such as 03:00 (got '$Time')."
    }

    $argument = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Silent -RunSavedSettings' -f $launcher
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
    $trigger = New-ScheduledTaskTrigger -Daily -At $parsed
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

    Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Principal $principal -Force -Description 'Win10Debloat maintenance run' | Out-Null
    return $Name
}

# ---------------------------------------------------------------------------
# Preflight, elevation and launch
# ---------------------------------------------------------------------------

function Test-Preflight {
    param([bool]$NeedsNetwork)

    $problems = @()

    if ($PSVersionTable.PSVersion.Major -lt 5) {
        $problems += 'PowerShell 5.1 or newer is required.'
    }

    $tempRoot = $env:TEMP
    if (-not $tempRoot) {
        $problems += 'The TEMP environment variable is not set.'
    }
    else {
        try {
            New-DirectoryIfMissing -Path $tempRoot
            $probe = Join-Path $tempRoot ('win10debloat-probe-{0}.tmp' -f $PID)
            Set-Content -LiteralPath $probe -Value 'ok' -Encoding ASCII
            Remove-Item -LiteralPath $probe -Force
        }
        catch {
            $problems += ('TEMP is not writable: {0}' -f $tempRoot)
        }
    }

    $freeMb = Get-FreeSpaceMb -Path $tempRoot
    if ($freeMb -ge 0 -and $freeMb -lt 250) {
        $problems += ('At least 250 MB free is needed on {0}; found {1} MB.' -f $tempRoot, $freeMb)
    }

    if ($NeedsNetwork) {
        Set-Tls12
        if (-not (Test-TcpEndpoint -Target 'github.com' -Port 443)) {
            $problems += 'github.com is not reachable on port 443. Use -BundlePath for an offline run.'
        }
    }

    return $problems
}

function Invoke-SelfElevation {
    param([string]$Arguments)

    $argument = '-NoProfile -ExecutionPolicy Bypass -File "{0}" {1}' -f $PSCommandPath, $Arguments
    try {
        $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argument -Wait -PassThru -ErrorAction Stop
        return $process.ExitCode
    }
    catch {
        Write-Fail ('Elevation failed: {0}' -f $_.Exception.Message)
        return $script:ExitElevation
    }
}

function Invoke-DebloatScript {
    param([string]$ScriptPath, [string]$Arguments)

    $windowStyle = 'Normal'
    if ($Silent) { $windowStyle = 'Hidden' }
    elseif ([string]::IsNullOrWhiteSpace($Arguments)) { $windowStyle = 'Minimized' }

    $argument = '-NoProfile -ExecutionPolicy Bypass -File "{0}" {1}' -f $ScriptPath, $Arguments

    $process = Start-Process -FilePath 'powershell.exe' -WindowStyle $windowStyle -PassThru -ArgumentList $argument -ErrorAction Stop
    $process.WaitForExit()
    return $process.ExitCode
}

function Get-ExitCodeText {
    param([int]$Code)

    switch ($Code) {
        0 { return 'success' }
        1 { return 'unexpected error' }
        2 { return 'preflight check failed' }
        3 { return 'download failed' }
        4 { return 'elevation failed' }
        5 { return 'unsupported operating system' }
        6 { return 'invalid configuration' }
        default { return 'reported by Win11Debloat' }
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

function Invoke-LauncherMain {
    $script:Step = 0
    $script:DryRun = [bool]$WhatIf
    $started = Get-Date

    $tempRoot = $env:TEMP
    if (-not $tempRoot) { $tempRoot = [System.IO.Path]::GetTempPath() }
    if (-not $tempRoot) { $tempRoot = '.' }

    $workRoot = Join-Path $tempRoot 'Win11Debloat'
    if ($WorkPath) { $workRoot = $WorkPath }

    try {
        New-DirectoryIfMissing -Path (Join-Path $workRoot 'Logs')
        $script:LogFile = Join-Path (Join-Path $workRoot 'Logs') ('Launcher-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    }
    catch {
        $script:LogFile = $null
    }

    if (-not $Silent) {
        Write-Host ''
        Write-Host '-------------------------------------------------------------------------------------------'
        Write-Host (' Win10Debloat Launcher {0}' -f $script:LauncherVersion)
        Write-Host ' Windows 10 first, Windows 11 capable'
        Write-Host '-------------------------------------------------------------------------------------------'
    }

    $os = Get-OperatingSystemInfo

    if ($Diagnostics) {
        Show-Diagnostics
        return $script:ExitSuccess
    }
    if ($ListTweaks) {
        Show-TweakCatalog
        return $script:ExitSuccess
    }
    if ($ListStartupItems) {
        Show-StartupItems -WorkRoot $workRoot
        return $script:ExitSuccess
    }
    if ($CheckUpdate) {
        if (Show-UpstreamRelease) { return $script:ExitSuccess }
        return $script:ExitDownload
    }
    if ($Uninstall) {
        if (-not $Silent) {
            Write-Host ''
            $answer = Read-Host ('Remove "{0}" including configs, logs and backups? [y/N]' -f $workRoot)
            if ($answer -notmatch '^(y|yes)$') {
                Write-Host 'Cancelled.'
                return $script:ExitSuccess
            }
        }
        $removed = @(Remove-LauncherData -WorkRoot $workRoot)
        if ($removed.Count -eq 0) { Write-Info 'Nothing to remove.' }
        else { $removed | ForEach-Object { Write-Success ('Removed {0}' -f $_) } }
        return $script:ExitSuccess
    }

    # ---- operating system gate ----
    $planOnly = ([bool]$WhatIf -and [bool]$Win10Safe)
    if (-not $os.Supported -and -not $planOnly) {
        Write-Fail ('Unsupported operating system: {0} (build {1}).' -f $os.Caption, $os.Build)
        Write-Info 'This launcher targets Windows 10 1507 (10240) and newer.'
        Wait-ForUserExit
        return $script:ExitUnsupported
    }
    if ($planOnly -and -not $os.Supported) {
        Write-Warn 'Not running on Windows: -Win10Safe -WhatIf only prints the plan.'
    }

    Write-Step ('Operating system: {0} build {1}.{2} ({3})' -f $os.Caption, $os.Build, $os.UBR, $os.Class)
    if ($os.Class -eq 'Windows11') {
        Write-Warn 'Windows 11 detected. Windows 11 only switches are only filtered with -Win10Safe.'
    }
    elseif ($os.Class -eq 'Windows10') {
        Write-Info 'Windows 10 detected: Windows 11 only switches are filtered automatically.'
    }

    # ---- tweak selection ----
    $tweakPlan = $null
    if ($Preset -or $Win10Tweaks) {
        $tweakPlan = Select-Win10Tweak -Ids $Win10Tweaks -PresetName $Preset
        if ($tweakPlan.Unknown.Count -gt 0) {
            Write-Fail ('Unknown tweak id(s): {0}. Run -ListTweaks to see the catalog.' -f ($tweakPlan.Unknown -join ', '))
            return $script:ExitConfig
        }
    }
    # ---- forwarded switch set ----
    if ($Dev) { $Channel = 'Dev' }

    $forwarded = @{}
    foreach ($key in $script:LauncherBoundParameters.Keys) {
        if ($script:LauncherOnlyParameters -contains $key) { continue }
        $forwarded[$key] = $script:LauncherBoundParameters[$key]
    }

    if ($LauncherConfig) {
        $settingsFile = $LauncherConfig
        if (-not (Test-Path -LiteralPath $settingsFile)) {
            $candidate = Join-Path (Join-Path $workRoot 'Config') $LauncherConfig
            if (Test-Path -LiteralPath $candidate) { $settingsFile = $candidate }
        }
        if (-not (Test-Path -LiteralPath $settingsFile)) {
            Write-Fail ('Launcher config not found: {0}' -f $LauncherConfig)
            return $script:ExitConfig
        }
        try {
            $imported = Import-LauncherSettings -Path $settingsFile
        }
        catch {
            Write-Fail ('Could not read the launcher config: {0}' -f $_.Exception.Message)
            return $script:ExitConfig
        }
        foreach ($key in $imported.Settings.Keys) {
            if (-not $forwarded.ContainsKey($key)) { $forwarded[$key] = $imported.Settings[$key] }
        }
        if ($imported.Unknown.Count -gt 0) {
            Write-Warn ('Ignored unknown config keys: {0}' -f ($imported.Unknown -join ', '))
        }
        if ($imported.Settings.ContainsKey('StartupItems') -and -not $StartupItems) {
            $StartupItems = @($imported.Settings['StartupItems'])
        }
    }

    $windows10Target = $false
    if ($os.Class -eq 'Windows10') { $windows10Target = $true }
    if ($Win10Safe) { $windows10Target = $true }
    if ($IgnoreCompatibility) { $windows10Target = $false }

    $split = Split-CompatibleSwitch -Parameters $forwarded -Windows10 $windows10Target

    $conflicts = @(Test-SwitchConflict -Parameters $split.Kept)
    if ($conflicts.Count -gt 0) {
        foreach ($conflict in $conflicts) { Write-Fail $conflict }
        return $script:ExitConfig
    }

    $argumentString = ConvertTo-ArgumentList -Parameters $split.Kept -Exclude @($script:LauncherOnlyParameters)

    # ---- startup item selection ----
    $startupPlan = $null
    $startupConfigPath = Join-Path (Join-Path $workRoot 'Config') $script:StartupConfigFile
    if (-not $RevertStartupItems) {
        $startupRequest = @($StartupItems | Where-Object { $_ })
        if ($startupRequest.Count -eq 0 -and (Test-Path -LiteralPath $startupConfigPath)) {
            try {
                $startupRequest = @(Import-StartupItemConfig -Path $startupConfigPath)
            }
            catch {
                Write-Fail ('Could not read {0}: {1}' -f $startupConfigPath, $_.Exception.Message)
                return $script:ExitConfig
            }
        }
        if ($startupRequest.Count -gt 0) {
            $startupPlan = Select-StartupItem -Names $startupRequest
        }
    }

    if ($TweaksOnly -and $null -eq $tweakPlan -and $null -eq $startupPlan) {
        Write-Fail 'Nothing to do: -TweaksOnly needs -Preset, -Win10Tweaks or -StartupItems.'
        return $script:ExitConfig
    }

    # ---- plan output / dry run ----
    if ($WhatIf) {
        Write-Step 'Planned run (WhatIf)'
        if ($windows10Target) {
            Write-Info ('  Target            : Windows 10 (build {0} reference)' -f $TargetBuild)
        }
        else {
            Write-Info '  Target            : current Windows release'
        }
        if ($BundlePath) { Write-Info ('  Source            : offline bundle {0}' -f $BundlePath) }
        elseif ($Version) { Write-Info ('  Source            : release {0}' -f $Version) }
        else { Write-Info ('  Source            : {0} channel' -f $Channel) }
        Write-Info ('  Work folder       : {0}' -f $workRoot)
        if ($argumentString) { Write-Info ('  Win11Debloat args : {0}' -f $argumentString) }
        else { Write-Info '  Win11Debloat args : none' }

        if ($split.Dropped.Count -gt 0) {
            Write-Info ''
            Write-Info ('  Dropped for Windows 10 ({0}):' -f $split.Dropped.Count)
            foreach ($drop in $split.Dropped) {
                Write-Info ('    - {0}: {1}' -f $drop.Name, $drop.Reason)
            }
        }
        if ($null -ne $tweakPlan) {
            Write-Info ''
            Write-Info ('  Windows 10 tweaks ({0}):' -f $tweakPlan.Selected.Count)
            foreach ($tweak in $tweakPlan.Selected) {
                Write-Info ('    + {0} - {1}' -f $tweak.Id, $tweak.Label)
            }
        }
        if ($null -ne $startupPlan) {
            Write-Info ''
            Write-Info ('  Startup items to disable ({0}):' -f $startupPlan.Selected.Count)
            foreach ($item in $startupPlan.Selected) {
                Write-Info ('    - {0} ({1})' -f $item.Name, (Get-StartupEntrySource -Entry $item))
            }
            if ($startupPlan.Unknown.Count -gt 0) {
                Write-Info ('    ? not found: {0}' -f ($startupPlan.Unknown -join ', '))
            }
        }
        Write-Info ''
        Write-Info '  Nothing was downloaded, written or changed.'
        return $script:ExitSuccess
    }

    # ---- elevation ----
    if (-not $os.IsAdmin -and -not $NoElevate) {
        Write-Step 'Requesting administrator rights'
        $relaunch = ConvertTo-ArgumentList -Parameters $script:LauncherBoundParameters -Exclude @('NoElevate')
        return (Invoke-SelfElevation -Arguments $relaunch)
    }
    if (-not $os.IsAdmin) {
        Write-Warn 'Running without administrator rights; machine-wide changes will fail.'
    }

    # ---- preflight ----
    Write-Step 'Preflight checks'
    $preflight = @(Test-Preflight -NeedsNetwork (-not $BundlePath))
    if ($preflight.Count -gt 0) {
        foreach ($problem in $preflight) { Write-Fail $problem }
        Wait-ForUserExit
        return $script:ExitPreflight
    }
    Write-Success 'Preflight checks passed.'

    if ($InstallScheduledTask) {
        try {
            $installed = Install-DebloatScheduledTask -Name $TaskName -Time $TaskTime
            Write-Success ('Scheduled task installed: {0} at {1}' -f $installed, $TaskTime)
        }
        catch {
            Write-Fail ('Could not install the scheduled task: {0}' -f $_.Exception.Message)
        }
    }

    # ---- optional restore point ----
    if ($CreateRestorePoint) {
        Write-Step 'Creating a system restore point'
        try {
            Checkpoint-Computer -Description 'Win10Debloat' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
            Write-Success 'Restore point created.'
        }
        catch {
            Write-Warn ('Restore point failed: {0}' -f $_.Exception.Message)
        }
    }

    # ---- Windows 10 tweaks ----
    $configDir = Join-Path $workRoot 'Config'
    $tweakBackupPath = Join-Path $configDir 'Win10Tweaks-backup.json'
    $startupBackupPath = Join-Path $configDir $script:StartupBackupFile
    $startupDisabledFolder = Join-Path $configDir $script:StartupDisabledFolder

    if ($RevertWin10Tweaks) {
        Write-Step 'Restoring Windows 10 tweaks'
        $restored = Restore-Win10TweakBackup -Path $tweakBackupPath
        if ($restored -eq 0) {
            Write-Warn ('No tweak backup found at {0}' -f $tweakBackupPath)
        }
        else {
            Write-Success ('Restored {0} registry value(s).' -f $restored)
        }
    }

    if ($null -ne $tweakPlan -and $tweakPlan.Selected.Count -gt 0) {
        Write-Step ('Applying {0} Windows 10 tweak(s)' -f $tweakPlan.Selected.Count)
        $backupEntries = New-Object System.Collections.ArrayList

        foreach ($tweak in $tweakPlan.Selected) {
            try {
                Invoke-Win10Tweak -Tweak $tweak -BackupCollector $backupEntries
                Write-Success $tweak.Label
            }
            catch {
                Write-Fail ('{0}: {1}' -f $tweak.Label, $_.Exception.Message)
            }
        }

        try {
            Save-Win10TweakBackup -Entries $backupEntries -Path $tweakBackupPath
            Write-Info ('  Previous values saved to {0}' -f $tweakBackupPath)
        }
        catch {
            Write-Warn ('Could not save the tweak backup: {0}' -f $_.Exception.Message)
        }
    }

    if ($RevertStartupItems) {
        Write-Step 'Restoring startup items'
        $restoredItems = Restore-StartupItemBackup -Path $startupBackupPath
        if ($restoredItems -eq 0) {
            Write-Warn ('No startup item backup found at {0}' -f $startupBackupPath)
        }
        else {
            Write-Success ('Restored {0} startup item(s).' -f $restoredItems)
        }
    }

    if ($null -ne $startupPlan -and $startupPlan.Selected.Count -gt 0) {
        Write-Step ('Disabling {0} startup item(s)' -f $startupPlan.Selected.Count)
        if ($startupPlan.Unknown.Count -gt 0) {
            Write-Warn ('Not found: {0}' -f ($startupPlan.Unknown -join ', '))
        }
        $startupBackupEntries = New-Object System.Collections.ArrayList

        foreach ($item in $startupPlan.Selected) {
            try {
                Disable-StartupItem -Entry $item -BackupCollector $startupBackupEntries -DisabledFolder $startupDisabledFolder
                Write-Success ('{0} ({1})' -f $item.Name, (Get-StartupEntrySource -Entry $item))
            }
            catch {
                Write-Fail ('{0}: {1}' -f $item.Name, $_.Exception.Message)
            }
        }

        try {
            Save-StartupItemBackup -Entries $startupBackupEntries -Path $startupBackupPath
            Write-Info ('  Previous startup state saved to {0}' -f $startupBackupPath)
        }
        catch {
            Write-Warn ('Could not save the startup item backup: {0}' -f $_.Exception.Message)
        }
    }

    if ($TweaksOnly) {
        Write-Step 'Done (tweaks only)'
        $elapsed = (Get-Date) - $started
        Write-Info ('  Elapsed: {0:hh\:mm\:ss}' -f $elapsed)
        if ($script:LogFile) { Write-Info ('  Log: {0}' -f $script:LogFile) }
        return $script:ExitSuccess
    }

    # ---- acquire the debloat bundle ----
    Write-Step 'Preparing Win11Debloat'
    $archivePath = Join-Path $env:TEMP ('win11debloat-{0}.zip' -f $PID)
    $stashRoot = Join-Path $env:TEMP ('win11debloat-preserve-{0}' -f $PID)
    $exitCode = $script:ExitSuccess

    try {
        Clear-WorkDirectory -WorkRoot $workRoot
        $stashed = @(Save-PreservedData -WorkRoot $workRoot -StashRoot $stashRoot)
        if ($stashed.Count -gt 0) { Write-Info ('  Preserving {0}' -f ($stashed -join ', ')) }

        if ($BundlePath) {
            Write-Info ('  Installing from {0}' -f $BundlePath)
            Install-Bundle -SourcePath $BundlePath -Destination $workRoot -ExpectedHash $Sha256
        }
        else {
            Set-Tls12
            $uri = Resolve-BundleUri -ReleaseTag $Version -ReleaseChannel $Channel
            Write-Info ('  Downloading {0}' -f $uri)
            if (-not (Invoke-BundleDownload -Uri $uri -Destination $archivePath -Attempts $Retries -TimeoutSeconds $TimeoutSec)) {
                Restore-PreservedData -WorkRoot $workRoot -StashRoot $stashRoot
                Write-Fail 'Could not download Win11Debloat. Check the connection or use -BundlePath.'
                return $script:ExitDownload
            }
            if (-not (Test-ArchiveHash -ArchivePath $archivePath -Expected $Sha256)) {
                Restore-PreservedData -WorkRoot $workRoot -StashRoot $stashRoot
                return $script:ExitDownload
            }
            Expand-BundleArchive -ArchivePath $archivePath -Destination $workRoot
        }

        Move-ExtractedBundle -WorkRoot $workRoot
        Restore-PreservedData -WorkRoot $workRoot -StashRoot $stashRoot

        $debloatScript = Join-Path $workRoot 'Win11Debloat.ps1'
        if (-not (Test-Path -LiteralPath $debloatScript)) {
            Write-Fail ('Win11Debloat.ps1 was not found in {0}' -f $workRoot)
            return $script:ExitDownload
        }
        Write-Success 'Bundle ready.'

        # ---- run ----
        if ($PSVersionTable.PSVersion.Major -ge 7) {
            $windowsModulePath = $env:PSModulePath -split ';' | Where-Object { $_ -like '*WindowsPowerShell*' }
            $env:PSModulePath = $windowsModulePath -join ';'
        }

        Write-Step 'Running Win11Debloat'
        if ($argumentString) { Write-Info ('  Arguments: {0}' -f $argumentString) }
        $exitCode = Invoke-DebloatScript -ScriptPath $debloatScript -Arguments $argumentString
    }
    catch {
        Write-Fail $_.Exception.Message
        $exitCode = $script:ExitError
    }
    finally {
        if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $stashRoot) { Remove-Item -LiteralPath $stashRoot -Recurse -Force -ErrorAction SilentlyContinue }

        if ($KeepFiles) {
            Write-Info ('  Script files kept in {0}' -f $workRoot)
        }
        else {
            Clear-WorkDirectory -WorkRoot $workRoot
        }
    }

    # ---- summary ----
    $elapsed = (Get-Date) - $started
    Write-Host ''
    Write-Host '-------------------------------------------------------------------------------------------'
    if ($exitCode -eq 0) {
        Write-Success ('Finished in {0:hh\:mm\:ss} - {1}.' -f $elapsed, (Get-ExitCodeText -Code $exitCode))
    }
    else {
        Write-Fail ('Finished in {0:hh\:mm\:ss} with exit code {1} ({2}).' -f $elapsed, $exitCode, (Get-ExitCodeText -Code $exitCode))
    }
    if ($split.Dropped.Count -gt 0) {
        Write-Info ('  Switches dropped for Windows 10: {0}' -f (($split.Dropped | ForEach-Object { $_.Name }) -join ', '))
    }
    if ($null -ne $tweakPlan) {
        Write-Info ('  Windows 10 tweaks applied: {0}' -f $tweakPlan.Selected.Count)
        Write-Info '  Revert with: -RevertWin10Tweaks'
    }
    if ($null -ne $startupPlan) {
        Write-Info ('  Startup items disabled: {0}' -f $startupPlan.Selected.Count)
        Write-Info '  Restore with: -RevertStartupItems'
    }
    if ($script:LogFile) { Write-Info ('  Log: {0}' -f $script:LogFile) }
    Write-Host '-------------------------------------------------------------------------------------------'

    return $exitCode
}

if ($MyInvocation.InvocationName -ne '.') {
    if ($args.Count -gt 0) {
        $unknown = ($args | ForEach-Object { [string]$_ }) -join ' '
        Write-Fail ('Unknown parameter(s): {0}' -f $unknown)
        Write-Info 'Run: Get-Help .\Win10Debloat-Launcher.ps1 -Detailed'
        exit $script:ExitConfig
    }
    exit (Invoke-LauncherMain)
}
