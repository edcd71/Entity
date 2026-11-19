-- Capture the rendered Entity page without navigating, reloading, or executing JavaScript.
-- Usage: osascript scripts/capture-entity-state.applescript /absolute/path/to/capture.mhtml
on run arguments
  if (count of arguments) is not 1 then error "Supply an absolute output path ending in .mhtml."
  set outputPath to item 1 of arguments
  if outputPath does not start with "/" or outputPath does not end with ".mhtml" then error "Use an absolute .mhtml output path."
  tell application "Google Chrome"
    if (count of windows) is 0 then error "No Chrome window is open."
    set targetTab to active tab of front window
    set pageURL to URL of targetTab
    if pageURL is not "http://127.0.0.1:4173/app/grid.html" and pageURL does not start with "http://127.0.0.1:4173/app/grid.html?" and pageURL does not start with "http://127.0.0.1:4173/app/grid.html#" then error "Select the local Entity grid tab first. No page was saved."
    save targetTab in POSIX file outputPath as "single file"
    return "Page archive requested: " & outputPath
  end tell
end run
