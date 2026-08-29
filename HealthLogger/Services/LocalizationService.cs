namespace HealthLogger.Services;

public class LocalizationService
{
    private readonly Dictionary<string, Dictionary<string, string>> _translations = new()
    {
        ["fi"] = new()
        {
            ["breakfast"] = "Aamupala",
            ["lunch"] = "Lounas",
            ["dinner"] = "Päivällinen",
            ["snack"] = "Välipala",
            ["supper"] = "Iltapala",
            ["calories"] = "Kalorit",
            ["protein"] = "Proteiini",
            ["fat"] = "Rasva",
            ["carbohydrate"] = "Hiilihydraatti",
            ["weight"] = "Paino",
            ["waist"] = "Vatsanympärysmitta",
            ["sleep_quality"] = "Unen laatu",
            ["mood"] = "Mieliala",
            ["energy"] = "Energiataso",
            ["stress"] = "Stressitaso"
        },
        ["en"] = new()
        {
            ["breakfast"] = "Breakfast",
            ["lunch"] = "Lunch",
            ["dinner"] = "Dinner",
            ["snack"] = "Snack",
            ["supper"] = "Supper",
            ["calories"] = "Calories",
            ["protein"] = "Protein",
            ["fat"] = "Fat",
            ["carbohydrate"] = "Carbohydrate",
            ["weight"] = "Weight",
            ["waist"] = "Waist circumference",
            ["sleep_quality"] = "Sleep quality",
            ["mood"] = "Mood",
            ["energy"] = "Energy level",
            ["stress"] = "Stress level"
        }
    };

    public string Translate(string key, string lang = "fi")
    {
        if (_translations.TryGetValue(lang, out var dict) && dict.TryGetValue(key, out var value))
            return value;
        return key;
    }
}
