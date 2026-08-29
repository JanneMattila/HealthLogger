using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthLogger.Migrations
{
    /// <inheritdoc />
    public partial class AddFoodUnitWeight : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "UnitWeightGrams",
                table: "FoodItems",
                type: "float",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UnitWeightGrams",
                table: "FoodItems");
        }
    }
}
