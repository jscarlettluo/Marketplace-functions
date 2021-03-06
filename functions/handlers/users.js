const { db, admin } = require('../util/admin');
const config = require('../util/config');
const firebase = require('firebase');
firebase.initializeApp(config)

const { validateSignupData, validateLoginData, validateUserDetails } = require('../util/validators'); 

//User signup
exports.signup = (req, res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle,
    };

    const { valid, errors } = validateSignupData(newUser);

    if(!valid) return res.status(400).json(errors);

    const noImg = 'blank_pfp.png'
    
    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
        .then(doc => {
            if(doc.exists){
                return res.status(400).json({ handle: `this handle is already taken`});
            } else {
                return firebase
                .auth()
                .createUserWithEmailAndPassword(newUser.email, newUser.password);
            }
        })
        .then(data => {
            userId = data.user.uid;
             return data.user.getIdToken();
        })
        .then(idToken => {
            token = idToken;
            const userCredentials = {
                handle: newUser.handle,
                email: newUser.email,
                createdAt: new Date().toISOString(),
                imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
                userId
            };
            return db.doc(`/users/${newUser.handle}`).set(userCredentials);
        })
        .then(() => {
            return res.status(201).json( {token} );
        })
        .catch(err => {
            if(err.code === "auth/email-already-in-use") {
                return res.status(400).json( {email: 'Email is already in use'});
            } else {
                return res.status(500).json({ error: err.code});
            }
        })
};

//User login
exports.login = (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    };

    const { valid, errors } = validateLoginData(user);

    if(!valid) return res.status(400).json(errors);

    firebase.auth().signInWithEmailAndPassword(user.email, user.password)
        .then(data => {
            return data.user.getIdToken();
        })
        .then(token => {
            return res.json({ token });
        })
        .catch((err) => {
            if(err.code === 'auth/wrong-password') {
                return res.status(403).json({ general: 'Wrong credentials, try again' });
            } else if(err.code === 'auth/user-not-found') {
                return res.status(403).json({ general: 'Wrong credentials, try again' });
            } else return res.status(500).json({ error: err.code });
        });
}; 

//Add user information
exports.addUserDetail = (req, res) => {
    const details = validateUserDetails(req.body);
    db.doc(`/users/${req.user.handle}`).update(details)
    .then(() => {
        return res.json({ message: 'Details added successfully'})
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({ error: err.code });
    })
};

//Get user information
exports.getUserInfo = (req, res) => {
    let userInfo = {}
    db.doc(`users/${req.user.handle}`).get()
        .then(doc => {
            if(doc.exists){
                userInfo.credentials = doc.data();
                return db.collection('likes').where('userHandle', '==', req.user.handle).get()
            }
        })
        .then(data => {
            userInfo.likes = [];
            data.forEach(doc => {
                userInfo.likes.push(doc.data);
            });
            return res.json(userInfo);
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({error: err.code});
        })
}

//Upload a profile pic for user
exports.imageUpload = (req, res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const busboy = new BusBoy({ headers: req.headers });

    let imageFileName;
    let imageToBeUploaded = {}

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        if(mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
            return res.status(400).json({ error: 'Wrong file type submitted' });
        }
        //.png .jpeg
        const imageExtension = filename.split('.')[filename.split('.').length - 1];
        // 90370548.png
        imageFileName = `${Math.round(Math.random() * 1000000)}.${imageExtension}`;
        const filePath = path.join(os.tmpdir(), imageFileName);
        imageToBeUploaded = { filePath, mimetype };
        file.pipe(fs.createWriteStream(filePath));
    });
    busboy.on('finish', () => {
        admin.storage().bucket().upload(imageToBeUploaded.filePath , {
            resumable: false,
            metadata: {
                metadata: {
                    contentType: imageToBeUploaded.mimetype
                }
            }
        })
        .then(() => {
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
            return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
        })
        .then(() => {
            return res.json({ message: 'Image uploaded successfully'});
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code });
        });
    });
    busboy.end(req.rawBody);
};


