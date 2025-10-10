// idp.js
import express from "express";
import session from "express-session";
import fs from "fs";
import path from "path";
import { IdentityProvider, ServiceProvider, setSchemaValidator } from "samlify";
import * as validator from "@authenio/samlify-node-xmllint";
import { findUserByEmail, verifyPassword } from "./user-management.js";
import userApiRouter from "./user-api.js";

setSchemaValidator(validator);

const app = express();

// Create User UI
app.get("/create-user", (req, res) => {
  res.sendFile(path.resolve(process.cwd(), "create-user.html"));
});

// Password Reset UI
app.get("/request-password-reset", (req, res) => {
  res.sendFile(path.resolve(process.cwd(), "request-password-reset.html"));
});

app.get("/reset-password", (req, res) => {
  res.sendFile(path.resolve(process.cwd(), "reset-password.html"));
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "super-strong-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax"
  }
}));

app.use("/api", userApiRouter);

// === Certs & env ===
const baseUrl = process.env.BASE_URL || "https://your-app-name.onrender.com";
const port = process.env.PORT || 8080;

// IdP signing keys (this IdP's key pair)
const idpPrivPath = process.env.IDP_PRIVATE_KEY_PATH || "./test-certs/idp-private.pem";
const idpPubPath  = process.env.IDP_PUBLIC_CERT_PATH  || "./test-certs/idp-public.cert";
if (!fs.existsSync(idpPrivPath) || !fs.existsSync(idpPubPath)) {
  console.error("ERROR: IdP certs missing. Create test-certs/idp-private.pem and idp-public.cert or set env paths.");
  process.exit(1);
}
const idpPrivateKey = fs.readFileSync(idpPrivPath, "utf8");
const idpPublicCert = fs.readFileSync(idpPubPath, "utf8");

// Quickbase SP info - the ACS and the SP public cert (used to verify signed AuthnRequest)
const quickbaseAcsUrl = process.env.QUICKBASE_ACS_URL || "https://ljodice.quickbase.com/saml/ssoassert.aspx";
const quickbaseEntity = process.env.QUICKBASE_ENTITY_ID || "https://quickbase.com";
const quickbaseCertPath = process.env.QUICKBASE_CERT_PATH || "./test-certs/quickbase-public.cert";

if (!fs.existsSync(quickbaseCertPath)) {
  console.error("WARNING: Quickbase public cert not found at", quickbaseCertPath);
  console.error("If Quickbase will sign AuthnRequests, place their x509 PEM at that path or set QUICKBASE_CERT_PATH env.");
  // We do not exit here — signature verification will fail if requests are signed.
}

// Load Quickbase cert if present (PEM content)
let quickbasePublicCert = null;
if (fs.existsSync(quickbaseCertPath)) {
  quickbasePublicCert = fs.readFileSync(quickbaseCertPath, "utf8");
}

// --- ServiceProvider (Quickbase) ---
// If quickbasePublicCert is provided we include it in metadata so samlify can use it to validate signatures.
const spMetadataKeyDescriptor = quickbasePublicCert
  ? `<KeyDescriptor use="signing"><KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><X509Data><X509Certificate>${quickbasePublicCert.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g,'')}</X509Certificate></X509Data></KeyInfo></KeyDescriptor>`
  : "";

const sp = ServiceProvider({
  metadata: `
    <EntityDescriptor entityID="${quickbaseEntity}" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
      <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        ${spMetadataKeyDescriptor}
        <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${quickbaseAcsUrl}" index="1" isDefault="true"/>
      </SPSSODescriptor>
    </EntityDescriptor>`
});

// --- IdentityProvider (this app) ---
const idp = IdentityProvider({
  metadata: `
    <EntityDescriptor entityID="${baseUrl}/metadata" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
      <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${baseUrl}/sso"/>
        <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${baseUrl}/sso/post"/>
        <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${baseUrl}/slo"/>
        <KeyDescriptor use="signing">
          <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
            <X509Data><X509Certificate>${idpPublicCert.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g,'')}</X509Certificate></X509Data>
          </KeyInfo>
        </KeyDescriptor>
      </IDPSSODescriptor>
    </EntityDescriptor>
  `,
  privateKey: idpPrivateKey,
  wantAuthnRequestsSigned: !!quickbasePublicCert // require signature validation if we have SP cert
});

// === Endpoints ===

// Metadata endpoint
app.get("/metadata", (req, res) => {
  res.type("application/xml");
  res.send(idp.getMetadata());
});

// Health
app.get("/health", (req, res) => {
  res.json({ status: "ok", baseUrl, timestamp: new Date().toISOString() });
});

 

// Login UI
app.get("/login", (req, res) => {
  // if user already authenticated and there's pending authnRequest, proceed
  if (req.session.user && req.session.authnRequest) {
    return res.redirect("/sso/complete");
  }
  // Simple login form (replace with real UI)
  res.send(`
    <h2>IdP Login</h2>
    <form method="post" action="/login">
      <label>Email: <input name="email" type="email" required /></label><br/>
      <label>Password: <input name="password" type="password" required /></label><br/>
      <button type="submit">Sign in</button>
    </form>
    <p><a href="/request-password-reset">Forgot your password?</a></p>
  `);
});

// Login POST - authenticate user
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send("Missing credentials");

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).send("Incorrect email or password.");
    }

    const isPasswordCorrect = await verifyPassword(password, user.hashedPassword);
    if (!isPasswordCorrect) {
      return res.status(401).send("Incorrect email or password.");
    }

    // Don't store the hashed password in the session
    const { hashedPassword, ...userToStore } = user;
    req.session.user = userToStore;

    // If there was an SP-initiated request, finish it
    if (req.session.authnRequest) return res.redirect("/sso/complete");
    // Otherwise, IdP-initiated flows could be started here
    res.redirect("/profile");
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("An internal server error occurred.");
  }
});

app.get("/profile", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.send(`<h3>Signed in as ${req.session.user.email}</h3><p><a href="/logout">Logout</a></p>`);
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// === SP-initiated SSO endpoints ===
// Redirect binding (Quickbase might send Redirect binding)
app.get("/sso", async (req, res) => {
  try {
    // parseLoginRequest will validate signature when possible (uses SP metadata's cert)
    const parsed = await idp.parseLoginRequest(sp, "redirect", req);
    // parsed.extract contains request info including id, issuer, assertionConsumerService URLs, nameIDPolicy, etc.
    req.session.authnRequest = parsed.extract;
    req.session.relayState = req.query.RelayState || "";
    console.log("Parsed AuthnRequest (redirect):", parsed.extract);
    return res.redirect("/login");
  } catch (err) {
    console.error("Failed to parse/validate AuthnRequest (redirect):", err && err.message || err);
    // If signature is required but missing/invalid, reject the request explicitly.
    return res.status(400).send(`
      <h3>Invalid SAML AuthnRequest</h3>
      <pre>${(err && err.message) || err}</pre>
    `);
  }
});

// POST binding (Quickbase may send POST with base64 SAMLRequest)
app.post("/sso/post", async (req, res) => {
  try {
    const parsed = await idp.parseLoginRequest(sp, "post", req);
    req.session.authnRequest = parsed.extract;
    req.session.relayState = req.body.RelayState || "";
    console.log("Parsed AuthnRequest (post):", parsed.extract);
    return res.redirect("/login");
  } catch (err) {
    console.error("Failed to parse/validate AuthnRequest (post):", err && err.message || err);
    return res.status(400).send(`
      <h3>Invalid SAML AuthnRequest</h3>
      <pre>${(err && err.message) || err}</pre>
    `);
  }
});

// Complete SSO and create signed SAMLResponse (IdP creates signed assertion)
app.get("/sso/complete", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  if (!req.session.authnRequest) return res.status(400).send("No AuthnRequest in session");

  const user = req.session.user;
  const authn = req.session.authnRequest;
  const relayState = req.session.relayState || "";

  try {
    // Build response using samlify - it will sign using our private key
    // We include audience/recipient info per the original AuthnRequest
    const options = {
      // ensure we include the original request ID so SP can validate InResponseTo
      extract: {
        request: {
          id: authn.id
        }
      },
      relayState,
      // telling samlify to produce a POST binding response (context will include an auto-posting form)
      binding: "post",
      // response assertion structure
      response: {
        assertion: {
          Subject: {
            NameID: {
              value: user.email,
              Format: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
            },
            SubjectConfirmation: {
              SubjectConfirmationData: {
                Recipient: quickbaseAcsUrl,
                NotOnOrAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
                InResponseTo: authn.id
              }
            }
          },
          // Attributes Quickbase expects — map accordingly
          AttributeStatement: {
            attributes: [
              { name: "EmailAddress", value: user.email },
              { name: "FirstName", value: user.firstName },
              { name: "LastName", value: user.lastName }
              // add groups/roles if you want
            ]
          },
          Conditions: {
            AudienceRestriction: {
              Audience: quickbaseEntity
            }
          }
        }
      }
    };

    // createLoginResponse will sign assertion/response using idp.privateKey
    const loginResponse = await idp.createLoginResponse(sp, options);

    // loginResponse.context commonly contains an HTML form that auto-posts to the SP ACS.
    if (loginResponse && loginResponse.context) {
      // Clear SAML session state after use
      delete req.session.authnRequest;
      delete req.session.relayState;
      return res.send(loginResponse.context);
    }

    // Fallback: if a raw XML was returned, base64 it and send a manual form
    const xml = loginResponse;
    const base64 = Buffer.from(xml).toString("base64");
    delete req.session.authnRequest;
    delete req.session.relayState;
    return res.send(`
      <html><body onload="document.forms[0].submit()">
        <form method="post" action="${quickbaseAcsUrl}">
          <input type="hidden" name="SAMLResponse" value="${base64}" />
          <input type="hidden" name="RelayState" value="${relayState}" />
        </form>
      </body></html>
    `);

  } catch (err) {
    console.error("Failed to create SAMLResponse:", err);
    return res.status(500).send(`
      <h3>Failed to create SAML Response</h3>
      <pre>${(err && err.message) || err}</pre>
    `);
  }
});

// --- Start server ---
app.listen(port, () => {
  console.log(`IdP running at ${baseUrl} (listening ${port})`);
  console.log(`Metadata: ${baseUrl}/metadata`);
  console.log(`SSO (Redirect): ${baseUrl}/sso`);
  console.log(`SSO (POST): ${baseUrl}/sso/post`);
  console.log(`Health: ${baseUrl}/health`);
  if (quickbasePublicCert) console.log("Quickbase public cert loaded for signature validation.");
  else console.log("Quickbase public cert not found — incoming signed AuthnRequests won't be validated.");
});
