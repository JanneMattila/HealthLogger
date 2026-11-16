using HealthLogger.Repositories;
using Microsoft.Extensions.Caching.Memory;

namespace HealthLogger.Services;

/// <summary>
/// Caches each user's favorites version so it can be stamped on every API response
/// (X-Favorites-Version) without a database lookup per request. Writes on this instance
/// update the cache immediately; the expiry bounds staleness when scaled out.
/// </summary>
public class FavoritesVersionCache
{
    public const string HeaderName = "X-Favorites-Version";
    private static readonly TimeSpan Expiry = TimeSpan.FromMinutes(5);
    private readonly IMemoryCache _cache;

    public FavoritesVersionCache(IMemoryCache cache) => _cache = cache;

    public async Task<long> GetAsync(Guid userId, UserRepository repo)
    {
        if (_cache.TryGetValue(Key(userId), out long version)) return version;
        version = await repo.GetFavoritesVersionAsync(userId);
        Set(userId, version);
        return version;
    }

    public void Set(Guid userId, long version) =>
        _cache.Set(Key(userId), version, Expiry);

    private static string Key(Guid userId) => $"favorites-version:{userId}";
}
