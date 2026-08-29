using System.Security.Claims;

namespace HealthLogger.Extensions;

public static class UserIdExtensions
{
    public static string GetAppUserId(this HttpContext httpContext)
    {
        var appUserId = httpContext.User.FindFirst("app_user_id")?.Value;
        if (!string.IsNullOrEmpty(appUserId))
            return appUserId;

        throw new UnauthorizedAccessException("No user ID found in claims");
    }

    public static bool IsAdmin(this HttpContext httpContext)
    {
        return httpContext.User.IsInRole("Admin");
    }
}
