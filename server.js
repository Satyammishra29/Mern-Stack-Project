const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const Transaction = require('./models/Transaction');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/transactionsDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Initialize database with seed data
app.post('/api/initialize', async (req, res) => {
    try {
        const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        const transactions = response.data;

        // Clear existing data
        await Transaction.deleteMany({});

        // Insert new data
        await Transaction.insertMany(transactions);
        res.status(200).json({ message: 'Database initialized successfully' });
    } catch (error) {
        console.error('Error initializing database:', error);
        res.status(500).json({ message: 'Error initializing database' });
    }
});

// List all transactions with search and pagination
app.get('/api/transactions', async (req, res) => {
    const { page = 1, perPage = 10, search = '', month } = req.query;

    const query = month ? { dateOfSale: { $regex: new RegExp(month, 'i') } } : {};

    if (search) {
        query.$or = [
            { title: { $regex: new RegExp(search, 'i') } },
            { description: { $regex: new RegExp(search, 'i') } },
            { price: { $regex: new RegExp(search, 'i') } },
        ];
    }

    try {
        const transactions = await Transaction.find(query)
            .skip((page - 1) * perPage)
            .limit(Number(perPage));
        const total = await Transaction.countDocuments(query);
        res.status(200).json({ transactions, total });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});

// Statistics for the selected month
app.get('/api/statistics', async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).json({ message: 'Month is required' });
    }

    try {
        const totalSales = await Transaction.aggregate([
            { $match: { dateOfSale: { $regex: new RegExp(month, 'i') } } },
            { $group: { _id: null, total: { $sum: '$price' } } },
        ]);

        const totalSoldItems = await Transaction.countDocuments({
            dateOfSale: { $regex: new RegExp(month, 'i') },
        });

        const totalNotSoldItems = await Transaction.countDocuments({
            dateOfSale: { $not: { $regex: new RegExp(month, 'i') } },
        });

        res.status(200).json({
            totalSales: totalSales[0]?.total || 0,
            totalSoldItems,
            totalNotSoldItems,
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ message: 'Error fetching statistics' });
    }
});

// Bar chart data for the selected month
app.get('/api/bar-chart', async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).json({ message: 'Month is required' });
    }

    try {
        const priceRanges = [
            { range: '0-100', count: 0 },
            { range: '101-200', count: 0 },
            { range: '201-300', count: 0 },
            { range: '301-400', count: 0 },
            { range: '401-500', count: 0 },
            { range: '501-600', count: 0 },
            { range: '601-700', count: 0 },
            { range: '701-800', count: 0 },
            { range: '801-900', count: 0 },
            { range: '901-above', count: 0 },
        ];

        const transactions = await Transaction.find({
            dateOfSale: { $regex: new RegExp(month, 'i') },
        });

        transactions.forEach(transaction => {
            const price = transaction.price;
            if (price <= 100) priceRanges[0].count++;
            else if (price <= 200) priceRanges[1].count++;
            else if (price <= 300) priceRanges[2].count++;
            else if (price <= 400) priceRanges[3].count++;
            else if (price <= 500) priceRanges[4].count++;
            else if (price <= 600) priceRanges[5].count++;
            else if (price <= 700) priceRanges[6].count++;
            else if (price <= 800) priceRanges[7].count++;
            else if (price <= 900) priceRanges[8].count++;
            else priceRanges[9].count++;
        });

        res.status(200).json(priceRanges);
    } catch (error) {
        console.error('Error fetching bar chart data:', error);
        res.status(500).json({ message: 'Error fetching bar chart data' });
    }
});

// Pie chart data for the selected month
app.get('/api/pie-chart', async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).json({ message: 'Month is required' });
    }

    try {
        const categories = await Transaction.aggregate([
            { $match: { dateOfSale: { $regex: new RegExp(month, 'i') } } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
        ]);

        res.status(200).json(categories);
    } catch (error) {
        console.error('Error fetching pie chart data:', error);
        res.status(500).json({ message: 'Error fetching pie chart data' });
    }
});

// Combined response from all APIs
app.get('/api/combined', async (req, res) => {
    const { month } = req.query;

    if (!month) {
        return res.status(400).json({ message: 'Month is required' });
    }

    try {
        const transactions = await Transaction.find({
            dateOfSale: { $regex: new RegExp(month, 'i') },
        });

        const totalSales = await Transaction.aggregate([
            { $match: { dateOfSale: { $regex: new RegExp(month, 'i') } } },
            { $group: { _id: null, total: { $sum: '$price' } } },
        ]);

        const totalSoldItems = await Transaction.countDocuments({
            dateOfSale: { $regex: new RegExp(month, 'i') },
        });

        const totalNotSoldItems = await Transaction.countDocuments({
            dateOfSale: { $not: { $regex: new RegExp(month, 'i') } },
        });

        const priceRanges = await getBarChartData(month);
        const categories = await getPieChartData(month);

        res.status(200).json({
            transactions,
            totalSales: totalSales[0]?.total || 0,
            totalSoldItems,
            totalNotSoldItems,
            priceRanges,
            categories,
        });
    } catch (error) {
        console.error('Error fetching combined data:', error);
        res.status(500).json({ message: 'Error fetching combined data' });
    }
});

// Helper function to get bar chart data
async function getBarChartData(month) {
    const priceRanges = [
        { range: '0-100', count: 0 },
        { range: '101-200', count: 0 },
        { range: '201-300', count: 0 },
        { range: '301-400', count: 0 },
        { range: '401-500', count: 0 },
        { range: '501-600', count: 0 },
        { range: '601-700', count: 0 },
        { range: '701-800', count: 0 },
        { range: '801-900', count: 0 },
        { range: '901-above', count: 0 },
    ];

    const transactions = await Transaction.find({
        dateOfSale: { $regex: new RegExp(month, 'i') },
    });

    transactions.forEach(transaction => {
        const price = transaction.price;
        if (price <= 100) priceRanges[0].count++;
        else if (price <= 200) priceRanges[1].count++;
        else if (price <= 300) priceRanges[2].count++;
        else if (price <= 400) priceRanges[3].count++;
        else if (price <= 500) priceRanges[4].count++;
        else if (price <= 600) priceRanges[5].count++;
        else if (price <= 700) priceRanges[6].count++;
        else if (price <= 800) priceRanges[7].count++;
        else if (price <= 900) priceRanges[8].count++;
        else priceRanges[9].count++;
    });

    return priceRanges;
}

// Helper function to get pie chart data
async function getPieChartData(month) {
    return await Transaction.aggregate([
        { $match: { dateOfSale: { $regex: new RegExp(month, 'i') } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
