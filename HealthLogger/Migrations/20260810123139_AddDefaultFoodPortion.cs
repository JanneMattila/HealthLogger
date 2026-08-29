using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthLogger.Migrations
{
    /// <inheritdoc />
    public partial class AddDefaultFoodPortion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "DefaultPortionGrams",
                table: "FoodItems",
                type: "float",
                nullable: false,
                defaultValue: 100.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultPortionGrams",
                table: "FoodItems");
        }
    }
}
