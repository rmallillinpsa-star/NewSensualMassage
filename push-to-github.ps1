# PowerShell script to push updates to GitHub
param(
    [string]$CommitMessage = "Update site files"
)

# Change to the repository root directory
Set-Location $PSScriptRoot

# Add all changes
git add .

# Commit with the provided message
git commit -m $CommitMessage

# Push to the main branch
git push origin main

Write-Host "Successfully pushed updates to GitHub!"