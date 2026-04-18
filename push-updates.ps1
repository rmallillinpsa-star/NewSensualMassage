# PowerShell script to push updates to GitHub
param(
    [Parameter(Mandatory=$true)]
    [string]$CommitMessage
)

# Change to the repository root directory (adjust path if needed)
Set-Location "C:\Users\PHNID\Downloads\SensualMassage-main\SensualMassage-main"

# Add all changes
Write-Host "Adding all changes..." -ForegroundColor Green
git add .

# Commit with the provided message
Write-Host "Committing with message: $CommitMessage" -ForegroundColor Green
git commit -m "$CommitMessage"

# Push to the main branch
Write-Host "Pushing to origin main..." -ForegroundColor Green
git push origin main

Write-Host "Successfully pushed updates to GitHub!" -ForegroundColor Green