require("dotenv").config({ path: ".env" });
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const app = express();
const bcrypt = require("bcrypt");
const server = require("http").Server(app);
const PORT = process.env.PORT || 3002;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;
const MONGOOSE_URL = process.env.MONGOOSE_URL;
const { PeerServer } = require("peer");
const corsOptions = {
	origin: ["https://diversion-frontend.vercel.app", "http://127.0.0.1:3000"],
	methods: ["GET", "POST"],
	credentials: true,
};

app.use(cors(corsOptions));
app.use(express.urlencoded());
app.use(express.json());

app.get("/", (req, res) => {
	res.send("Synclink Backend!");
});

const io = require("socket.io")(server, {
	cors: {
		origin: FRONTEND_ORIGIN,
		methods: ["GET", "POST"],
		credentials: true,
		allowedHeaders: ["Content-Type", "Authorization"],
	},
});

const peerServer = PeerServer({ port: 443, path: "/peer" }, (exp) => {
	console.log("Peerjs Server Running: " + exp.address().port);
});

peerServer.on("connection", (client) => {
	console.log("Client Connected: ", client.id);
});

const mongoose = require("mongoose");
const Doc = require("./models/Doc");
const User = require("./models/User");

mongoose
	.connect(MONGOOSE_URL, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
		useFindAndModify: false,
		useCreateIndex: true,
	})
	.then(() => console.log("connected to mongodb"))
	.catch((error) => console.error(error));

app.post("/register", async (req, res) => {
	try {
		// Hash the password
		const hashedPassword = await bcrypt.hash(req.body.password, 10);

		console.log(req.body);

		// Create a new user
		const user = new User({
			email: req.body.email,
			name: req.body.username,
			password: hashedPassword,
			userType: req.body.userType,
		});

		// Save the user to the database
		await user.save();
		res.status(201).send("User created successfully");
	} catch (error) {
		console.error(error);
		res.status(500).send("Error creating user");
	}
});

app.post("/login", async (req, res) => {
	try {
		// Find the user by username and only take email id from the data

		const user = await User.findOne({ email: req.body.email }).select("email userType");

		// If user not found, return error
		console.log(user);

		let userFound = { email: user.email, userType: user.userType };
		if (!user) {
			return res.status(404).send("User not found");
		}
		console.log({ userFound });
		res.status(200).send(userFound);
	} catch (error) {
		console.error(error);
		res.status(500).send("Error logging in");
	}
});

app.get("/runcode", (req, res) => {
	var url = req.query.url;
	const headers = {
		"Content-Type": "application/json",
		"client-secret": process.env.REACT_APP_HACKEREARTH_SECRET,
	};
	fetch(url, {
		method: "get",
		headers,
	})
		.then((res) => res.json())
		.then((json) => {
			res.send(json);
		})
		.catch((err) => {
			res.send(err);
		});
});

app.post("/runcode", (req, res) => {
	// get post data from request

	var data = req.body;

	const url = "https://api.hackerearth.com/v4/partner/code-evaluation/submissions/";
	fetch(url, {
		method: "post",
		body: JSON.stringify(data),
		headers: {
			"Content-Type": "application/json",
			"client-secret": process.env.REACT_APP_HACKEREARTH_SECRET,
		},
	})
		.then((res) => res.json())
		.then((json) => {
			res.send(json);
		})
		.catch((err) => {
			res.send(err);
		});
});

io.on("connection", (socket) => {
	console.log(`Connected to frontend!`);
	socket.on("get-document", async (DocId) => {
		const doc = await findOrCreateDocument(DocId);

		socket.join(DocId);

		socket.emit("load-document", doc);

		socket.on("changes", (delta) => {
			socket.broadcast.to(DocId).emit("receive-changes", delta);
		});

		socket.on("drawing", (data) => {
			socket.broadcast.emit("drawing", data);
		});

		socket.on("save-document", async (data) => {
			Doc.findByIdAndUpdate(
				{ _id: DocId },
				{
					html: data.html,
					css: data.css,
					js: data.js,
					pascal: data.pascal,
					perl: data.perl,
					php: data.php,
					ruby: data.ruby,
					python: data.python,
					cpp: data.cpp,
					java: data.java,
					input: data.input,
					output: data.output,
				}
			)
				.then((d) => {})
				.catch((err) => {
					console.error(err);
				});
		});

		socket.on("pencil-color-change", (color) => {
			console.log(color);
			socket.broadcast.to(DocId).emit("pencil-color-change", color);
		});
	});

	socket.on("join-room", (roomId, userId, userName) => {
		socket.join(roomId);
		socket.to(roomId).emit("user-connected", userId);

		socket.on("toggled", (userId, video, audio) => {
			socket.to(roomId).emit("received-toggled-events", userId, video, audio);
		});

		socket.on("disconnect", () => {
			socket.to(roomId).emit("user-disconnected", userId);
		});
	});
});

var findOrCreateDocument = async (id) => {
	if (id === null) {
		return;
	}
	const document = await Doc.findById(id);
	if (document) return document;
	return await Doc.create({
		_id: id,
		html: "",
		css: "",
		js: "",
		python: "",
		java: "",
		cpp: "",
		input: "",
		output: "",
		pascal: "",
		perl: "",
		php: "",
		ruby: "",
	});
};

server.listen(PORT, () => {
	console.log(`Express Server Listening to ${PORT}`);
	console.log(`Socket Listening to ${FRONTEND_ORIGIN}`);
});
