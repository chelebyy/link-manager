param(
    [Parameter(Mandatory = $true)]
    [string] $CredentialPath
)

$ErrorActionPreference = 'Stop'
try {
    $credential = Import-Clixml -LiteralPath $CredentialPath
    if ($credential -isnot [System.Management.Automation.PSCredential] -or
        $credential.UserName -notmatch '^[a-zA-Z0-9_-]+\.access$' -or
        $credential.Password.Length -eq 0) {
        throw 'Invalid credential'
    }
    # The caller captures stdout privately as HTTP headers. Never log this output.
    @{
        'CF-Access-Client-Id' = $credential.UserName
        'CF-Access-Client-Secret' = $credential.GetNetworkCredential().Password
    } | ConvertTo-Json -Compress
} catch {
    [Console]::Error.WriteLine('MCP service credentials could not be loaded.')
    exit 1
}
