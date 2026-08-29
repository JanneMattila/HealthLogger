using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace HealthLogger.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    [HttpGet("login")]
    [AllowAnonymous]
    public IActionResult Login(string? returnUrl = "/")
    {
        return Challenge(new AuthenticationProperties { RedirectUri = returnUrl });
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Ok();
    }

    [HttpGet("status")]
    [AllowAnonymous]
    public IActionResult Status()
    {
        var userId = User.FindFirst("app_user_id")?.Value;
        var isLegacyGuest = User.HasClaim(claim => claim.Type == "guest_user_id");
        if (User.Identity?.IsAuthenticated == true && !string.IsNullOrEmpty(userId) && !isLegacyGuest)
        {
            var name = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
            var isAdmin = User.IsInRole("Admin");
            return Ok(new { authenticated = true, userId, name, isAdmin });
        }

        return Ok(new { authenticated = false });
    }
}
