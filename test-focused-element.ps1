# Test get_focused_element functionality
Write-Host "Testing get_focused_element..." -ForegroundColor Cyan

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

try {
    $automation = [System.Windows.Automation.AutomationElement]::FocusedElement
    
    if ($automation -ne $null) {
        Write-Host "✅ FocusedElement found!" -ForegroundColor Green
        
        $name = $automation.Current.Name
        $type = $automation.Current.LocalizedControlType
        $className = $automation.Current.ClassName
        
        Write-Host "Name: $name" -ForegroundColor Yellow
        Write-Host "Type: $type" -ForegroundColor Yellow
        Write-Host "ClassName: $className" -ForegroundColor Yellow
        
        # Try TextPattern
        try {
            $textPattern = $automation.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
            if ($textPattern -ne $null) {
                $range = $textPattern.DocumentRange
                $text = $range.GetText(100)
                Write-Host "Text (TextPattern): $text" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "❌ TextPattern not supported" -ForegroundColor Red
        }
        
        # Try LegacyIAccessible
        try {
            $legacyPattern = $automation.GetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern)
            if ($legacyPattern -ne $null) {
                $legacyName = $legacyPattern.Current.Name
                $legacyValue = $legacyPattern.Current.Value
                Write-Host "Legacy Name: $legacyName" -ForegroundColor Yellow
                Write-Host "Legacy Value: $legacyValue" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "❌ LegacyIAccessible not supported" -ForegroundColor Red
        }
        
        # Try BoundingRectangle
        try {
            $rect = $automation.Current.BoundingRectangle
            Write-Host "Bounds: Left=$($rect.Left), Top=$($rect.Top), Width=$($rect.Width), Height=$($rect.Height)" -ForegroundColor Green
            $centerX = [int]($rect.Left + ($rect.Width / 2))
            $centerY = [int]($rect.Top + ($rect.Height / 2))
            Write-Host "Center: ($centerX, $centerY)" -ForegroundColor Green
        } catch {
            Write-Host "❌ BoundingRectangle failed: $($_.Exception.Message)" -ForegroundColor Red
        }
        
    } else {
        Write-Host "❌ No focused element found" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
}

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
