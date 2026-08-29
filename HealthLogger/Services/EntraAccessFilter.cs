using System.Security.Claims;

namespace HealthLogger.Services;

public sealed class EntraAccessFilter
{
    private readonly HashSet<string> _allowedTenantIds;
    private readonly HashSet<string> _allowedUserIds;

    public EntraAccessFilter(IConfiguration configuration)
    {
        _allowedTenantIds = ParseIds(configuration["AccessControl:AllowedTenantIds"]);
        _allowedUserIds = ParseIds(configuration["AccessControl:AllowedUserIds"]);
    }

    public bool IsAllowed(ClaimsPrincipal? principal)
    {
        var tenantId = GetTenantId(principal);
        var userId = GetObjectId(principal);

        return (_allowedTenantIds.Count == 0 || tenantId is not null && _allowedTenantIds.Contains(tenantId))
            && (_allowedUserIds.Count == 0 || userId is not null && _allowedUserIds.Contains(userId));
    }

    public static string? GetObjectId(ClaimsPrincipal? principal) =>
        principal?.FindFirst("http://schemas.microsoft.com/identity/claims/objectidentifier")?.Value
        ?? principal?.FindFirst("oid")?.Value;

    public static string? GetTenantId(ClaimsPrincipal? principal) =>
        principal?.FindFirst("http://schemas.microsoft.com/identity/claims/tenantid")?.Value
        ?? principal?.FindFirst("tid")?.Value;

    private static HashSet<string> ParseIds(string? value) =>
        new(
            (value ?? string.Empty).Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            StringComparer.OrdinalIgnoreCase);
}