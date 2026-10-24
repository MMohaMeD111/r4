import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

await connection.query(
    `CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`
);

await connection.end();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
});

// Create tables
await pool.query(`
    CREATE TABLE IF NOT EXISTS Suppliers (
        SupplierID INT PRIMARY KEY AUTO_INCREMENT,
        SupplierName VARCHAR(100) NOT NULL,
        ContactNumber VARCHAR(15)
    )
`);

await pool.query(`
    CREATE TABLE IF NOT EXISTS Products (
        ProductID INT PRIMARY KEY AUTO_INCREMENT,
        ProductName VARCHAR(100) NOT NULL,
        Price DECIMAL(10,2),
        StockQuantity INT,
        SupplierID INT,
        FOREIGN KEY (SupplierID)
        REFERENCES Suppliers(SupplierID)
    )
`);

await pool.query(`
    CREATE TABLE IF NOT EXISTS Sales (
        SaleID INT PRIMARY KEY AUTO_INCREMENT,
        ProductID INT,
        QuantitySold INT,
        SaleDate DATE,
        FOREIGN KEY (ProductID)
        REFERENCES Products(ProductID)
    )
`);

// ================= PRODUCTS =================

// 1. Create product
app.post("/products", async (req, res) => {
    const { ProductName, Price, StockQuantity, SupplierID } = req.body;

    const sql = `
        INSERT INTO Products
        (ProductName, Price, StockQuantity, SupplierID)
        VALUES (?, ?, ?, ?)
    `;

    const [result] = await pool.execute(sql, [
        ProductName, Price, StockQuantity, SupplierID
    ]);

    res.status(201).json({
        message: "Product added",
        ProductID: result.insertId
    });
});

// 2. Get all products
app.get("/products", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM Products");
    res.json(rows);
});

// 3. Get product by ID
app.get("/products/:id", async (req, res) => {
    const [rows] = await pool.execute(
        "SELECT * FROM Products WHERE ProductID = ?",
        [req.params.id]
    );

    res.json(rows);
});

// 4. Update product
app.put("/products/:id", async (req, res) => {
    const { ProductName, Price, StockQuantity, SupplierID } = req.body;

    const sql = `
        UPDATE Products
        SET ProductName = ?, Price = ?,
            StockQuantity = ?, SupplierID = ?
        WHERE ProductID = ?
    `;

    const [result] = await pool.execute(sql, [
        ProductName, Price, StockQuantity,
        SupplierID, req.params.id
    ]);

    res.json({ message: "Product updated", affectedRows: result.affectedRows });
});

// 5. Delete product
app.delete("/products/:id", async (req, res) => {
    const [result] = await pool.execute(
        "DELETE FROM Products WHERE ProductID = ?",
        [req.params.id]
    );

    res.json({ message: "Product deleted", affectedRows: result.affectedRows });
});

// ================= SUPPLIERS =================

// 6. Create supplier
app.post("/suppliers", async (req, res) => {
    const { SupplierName, ContactNumber } = req.body;

    const [result] = await pool.execute(
        "INSERT INTO Suppliers (SupplierName, ContactNumber) VALUES (?, ?)",
        [SupplierName, ContactNumber]
    );

    res.status(201).json({
        message: "Supplier added",
        SupplierID: result.insertId
    });
});

// 7. Get all suppliers
app.get("/suppliers", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM Suppliers");
    res.json(rows);
});

// 8. Update supplier
app.put("/suppliers/:id", async (req, res) => {
    const { SupplierName, ContactNumber } = req.body;

    const [result] = await pool.execute(
        `UPDATE Suppliers
         SET SupplierName = ?, ContactNumber = ?
         WHERE SupplierID = ?`,
        [SupplierName, ContactNumber, req.params.id]
    );

    res.json({ message: "Supplier updated", affectedRows: result.affectedRows });
});

// 9. Delete supplier
app.delete("/suppliers/:id", async (req, res) => {
    const [result] = await pool.execute(
        "DELETE FROM Suppliers WHERE SupplierID = ?",
        [req.params.id]
    );

    res.json({ message: "Supplier deleted", affectedRows: result.affectedRows });
});

// ================= SALES =================

// 10. Record a sale
app.post("/sales", async (req, res) => {
    const { ProductID, QuantitySold, SaleDate } = req.body;

    const [result] = await pool.execute(
        `INSERT INTO Sales (ProductID, QuantitySold, SaleDate)
         VALUES (?, ?, ?)`,
        [ProductID, QuantitySold, SaleDate]
    );

    res.status(201).json({ message: "Sale added", SaleID: result.insertId });
});

// 11. Get all sales
app.get("/sales", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM Sales");
    res.json(rows);
});

// 12. Get sales for a specific product
app.get("/products/:id/sales", async (req, res) => {
    const [rows] = await pool.execute(
        "SELECT * FROM Sales WHERE ProductID = ?",
        [req.params.id]
    );

    res.json(rows);
});

// ============== DATABASE MODIFICATIONS ==============

// 13. Add Category column
app.post("/add-category", async (req, res) => {
    await pool.query(
        "ALTER TABLE Products ADD COLUMN Category VARCHAR(100)"
    );

    res.json({ message: "Category added" });
});

// 14. Remove Category column
app.delete("/remove-category", async (req, res) => {
    await pool.query(
        "ALTER TABLE Products DROP COLUMN Category"
    );

    res.json({ message: "Category removed" });
});

// 15. Change ContactNumber to VARCHAR(15)
app.put("/change-contact-number", async (req, res) => {
    await pool.query(
        "ALTER TABLE Suppliers MODIFY ContactNumber VARCHAR(15)"
    );

    res.json({ message: "ContactNumber changed" });
});

// 16. Make ProductName NOT NULL
app.put("/product-name-not-null", async (req, res) => {
    await pool.query(
        "ALTER TABLE Products MODIFY ProductName VARCHAR(100) NOT NULL"
    );

    res.json({ message: "ProductName is now NOT NULL" });
});

// ============== INSERT REQUIRED DATA ==============

// 17. Insert FreshFoods and its products and sale
app.post("/seed", async (req, res) => {
    const [supplier] = await pool.execute(
        "INSERT INTO Suppliers (SupplierName, ContactNumber) VALUES (?, ?)",
        ["FreshFoods", "01001234567"]
    );

    const supplierID = supplier.insertId;

    const products = [
        ["Milk", 15, 50, supplierID],
        ["Bread", 10, 30, supplierID],
        ["Eggs", 20, 40, supplierID]
    ];

    const productIDs = {};

    for (const product of products) {
        const [result] = await pool.execute(
            `INSERT INTO Products
            (ProductName, Price, StockQuantity, SupplierID)
            VALUES (?, ?, ?, ?)`,
            product
        );

        productIDs[product[0]] = result.insertId;
    }

    await pool.execute(
        `INSERT INTO Sales (ProductID, QuantitySold, SaleDate)
         VALUES (?, ?, ?)`,
        [productIDs.Milk, 2, "2025-05-20"]
    );

    res.json({ message: "Assignment data inserted" });
});

// 18. Update Bread price to 25
app.put("/bread-price", async (req, res) => {
    const [result] = await pool.execute(
        "UPDATE Products SET Price = ? WHERE ProductName = ?",
        [25, "Bread"]
    );

    res.json({ message: "Bread price updated", affectedRows: result.affectedRows });
});

// 19. Delete Eggs
app.delete("/eggs", async (req, res) => {
    const [result] = await pool.execute(
        "DELETE FROM Products WHERE ProductName = ?",
        ["Eggs"]
    );

    res.json({ message: "Eggs deleted", affectedRows: result.affectedRows });
});

// ============== REPORTS ==============

// 20. Total quantity sold for each product
app.get("/reports/total-sold", async (req, res) => {
    const [rows] = await pool.query(`
        SELECT Products.ProductName,
               COALESCE(SUM(Sales.QuantitySold), 0) AS TotalSold
        FROM Products
        LEFT JOIN Sales
        ON Products.ProductID = Sales.ProductID
        GROUP BY Products.ProductID, Products.ProductName
    `);

    res.json(rows);
});

// 21. Product with highest stock quantity
app.get("/reports/highest-stock", async (req, res) => {
    const [rows] = await pool.query(`
        SELECT *
        FROM Products
        WHERE StockQuantity = (
            SELECT MAX(StockQuantity) FROM Products
        )
    `);

    res.json(rows);
});

// 22. Suppliers whose names start with F
app.get("/reports/suppliers-f", async (req, res) => {
    const [rows] = await pool.query(
        "SELECT * FROM Suppliers WHERE SupplierName LIKE 'F%'"
    );

    res.json(rows);
});

// 23. Products that have never been sold
app.get("/reports/never-sold", async (req, res) => {
    const [rows] = await pool.query(`
        SELECT Products.*
        FROM Products
        LEFT JOIN Sales
        ON Products.ProductID = Sales.ProductID
        WHERE Sales.SaleID IS NULL
    `);

    res.json(rows);
});

// 24. Sales with product name, quantity and date
app.get("/reports/sales-details", async (req, res) => {
    const [rows] = await pool.query(`
        SELECT Products.ProductName,
               Sales.QuantitySold,
               Sales.SaleDate
        FROM Sales
        JOIN Products
        ON Sales.ProductID = Products.ProductID
    `);

    res.json(rows);
});

// Start server
app.listen(process.env.PORT || 3001, () => {
    console.log("Server is running");
});
