# Fineli Food Data

## Source
Data sourced from **Fineli® — National Food Composition Database**
Maintained by the Finnish Institute for Health and Welfare (THL)

## License
**Creative Commons Attribution 4.0 International (CC-BY 4.0)**

When using this data, you must attribute:
> Data source: Fineli®, THL

## Website
- https://fineli.fi/fineli/en/
- https://thl.fi/en/topics/lifestyles-and-nutrition/nutrition/fineli-the-national-food-composition-database

## Data Format
The `foods.json` file contains food items with the following structure:
- `fineliId` — Original Fineli food ID
- `nameFi` — Finnish name
- `nameEn` — English name
- `nameSv` — Swedish name
- `category` — Food category (in Finnish)
- `energyKcal` — Energy in kcal per 100g
- `energyKj` — Energy in kJ per 100g
- `protein` — Protein in g per 100g
- `fat` — Total fat in g per 100g
- `saturatedFat` — Saturated fat in g per 100g
- `carbohydrate` — Carbohydrate in g per 100g
- `sugar` — Sugar in g per 100g
- `fiber` — Fiber in g per 100g
- `salt` — Salt in g per 100g

## Updating Data
To update with fresh Fineli data:
1. Download CSV files from https://fineli.fi
2. Process `food.csv` and `component_value.csv` into the JSON format above
3. Replace `foods.json` with the updated data
4. The app will automatically seed new items on next startup
