# Arcana CLI marketing tape (vhs)
# Render:  vhs cli.tape        # -> arcana-cli.mp4
# Requires: arcana on PATH (bun link from packages/arcana), pwsh, ttyd, ffmpeg.
# First run bun JIT is slow -> generous Sleeps. Tune per machine.

Output arcana-cli.mp4
Set FontFamily "Cascadia Code"
Set FontSize 18
Set Width 1200
Set Height 675
Set Padding 20
Set Theme "Catppuccin Mocha"
Set Shell "bash"
Set TypingSpeed 12

Type "arcana doctor"
Enter
Sleep 5

Type "arcana models"
Enter
Sleep 5

Type "arcana session list"
Enter
Sleep 4

Type "arcana stats"
Enter
Sleep 4

Sleep 2