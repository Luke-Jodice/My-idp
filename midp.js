// idp.js
import express from "express";
import { IdentityProvider, ServiceProvider, setSchemaValidator } from "samlify";
import * as fs from "fs";
import * as validator from "@authenio/samlify-node-xmllint"; // optional validator

setSchemaValidator(validator);

const app = express();
app.use(express.urlencoded({ extended: true }));

// --- 1. Load certs ---
const idpPrivateKey = fs.readFileSync("./certs/idp-private.pem");
const idpPublicCert = fs.readFileSync("./certs/idp-public.cert");

// --- 2. Configure IdP ---
const baseUrl = process.env.BASE_URL || "https://your-app-name.onrender.com";
const idp = IdentityProvider({
  entityID: `${baseUrl}/metadata`,
  signingCert: idpPublicCert,
  privateKey: idpPrivateKey,
  singleSignOnService: [{
    Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
    Location: `${baseUrl}/sso`
  }],
  singleLogoutService: [{
    Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
    Location: `${baseUrl}/slo`
  }],
  wantAuthnRequestsSigned: false
});

// --- 3. Configure SP (Quickbase) ---
// You'll need your realm's ACS (check in Quickbase SSO config)
const quickbaseRealmUrl = process.env.QUICKBASE_REALM_URL || "https://ljodice.quickbase.com";
const quickbaseAcsUrl = process.env.QUICKBASE_ACS_URL || "https://ljodice.quickbase.com/saml/ssoassert.aspx";

const sp = ServiceProvider({
  entityID: "https://quickbase.com",
  assertionConsumerService: [{
    Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
    Location: quickbaseAcsUrl
  }]
});

// --- 4. Serve IdP metadata ---
app.get("/metadata", (req, res) => {
  res.type("application/xml");
  console.log(idp.getMetadata());
  res.send(idp.getMetadata());
});

// --- 5. Handle SSO login requests ---
app.get("/sso", async (req, res) => {
  // This endpoint receives AuthnRequests from Service Providers (like Quickbase)
  // Parse the SAML AuthnRequest and RelayState
  const { SAMLRequest, RelayState } = req.query;
  
  if (SAMLRequest) {
    // Decode and parse the SAML request
    const decodedRequest = Buffer.from(SAMLRequest, 'base64').toString('utf-8');
    console.log("Received SAML AuthnRequest:", decodedRequest);
    
    // For now, redirect to login with the request info
    res.redirect(`/login?SAMLRequest=${encodeURIComponent(SAMLRequest)}&RelayState=${encodeURIComponent(RelayState || '')}`);
  } else {
    // No SAML request, redirect to login page
    res.redirect("/login");
  }
});

// --- 6. Simulate successful login and send Assertion ---
app.get("/login", async (req, res) => {
  const { SAMLRequest, RelayState } = req.query;
  
  // Hardcode test user for demo
  const user = {
    email: "user@example.com",
    firstName: "Jane",
    lastName: "Smith"
  };

  const now = new Date();
  const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

  try {
    // Extract request ID from SAML request if available
    let requestId = "_test-request-id";
    if (SAMLRequest) {
      try {
        const decodedRequest = Buffer.from(SAMLRequest, 'base64').toString('utf-8');
        // Simple regex to extract request ID (in production, use proper XML parsing)
        const idMatch = decodedRequest.match(/ID="([^"]+)"/);
        if (idMatch) {
          requestId = idMatch[1];
        }
      } catch (e) {
        console.log("Could not parse SAML request, using default ID");
      }
    }

    // Create a simple SAML response for testing
    // For now, let's create a basic response that shows the configuration is working
    const testSAMLResponse = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" 
                xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                ID="_${Date.now()}"
                Version="2.0"
                IssueInstant="${new Date().toISOString()}"
                Destination="${quickbaseAcsUrl}"
                InResponseTo="${requestId}">
  <saml:Issuer>${idp.entityMeta.getEntityID()}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                  ID="_assertion_${Date.now()}"
                  Version="2.0"
                  IssueInstant="${new Date().toISOString()}">
    <saml:Issuer>${idp.entityMeta.getEntityID()}</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${user.email}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData NotOnOrAfter="${fiveMinutesLater.toISOString()}"
                                      Recipient="${quickbaseAcsUrl}"
                                      InResponseTo="${requestId}"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${new Date().toISOString()}"
                     NotOnOrAfter="${fiveMinutesLater.toISOString()}">
      <saml:AudienceRestriction>
        <saml:Audience>https://quickbase.com</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AttributeStatement>
      <saml:Attribute Name="EmailAddress">
        <saml:AttributeValue>${user.email}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="FirstName">
        <saml:AttributeValue>${user.firstName}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="LastName">
        <saml:AttributeValue>${user.lastName}</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

    // POST the SAMLResponse to Quickbase ACS
    res.send(`
      <html>
        <body>
          <h2>SAML Identity Provider - Login Successful</h2>
          <p>User: ${user.firstName} ${user.lastName} (${user.email})</p>
          <hr>
          <h3>Raw SAML Response XML:</h3>
          <pre>${testSAMLResponse}</pre>
          <hr>
          <h3>Base64 Encoded (for form submission):</h3>
          <pre>${Buffer.from(testSAMLResponse).toString("base64")}</pre>
          <hr>
          <form method="post" action="${quickbaseAcsUrl}">
            <input type="hidden" name="SAMLResponse" value="${Buffer.from(testSAMLResponse).toString("base64")}" />
            <input type="hidden" name="RelayState" value="${RelayState || ''}" />
            <button type="submit">Submit to Quickbase</button>
          </form>
          <hr>
          <p><a href="/metadata">View Metadata</a> | <a href="/sso">Test SSO</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error creating SAML response:", error);
    res.status(500).send(`
      <html>
        <body>
          <h2>SAML Identity Provider - Error</h2>
          <h3>Error creating SAML response:</h3>
          <pre>${error.message}</pre>
          <hr>
          <p>This might be due to a binding configuration issue.</p>
          <p><a href="/metadata">View Metadata</a> | <a href="/sso">Test SSO</a></p>
        </body>
      </html>
    `);
  }
});

// --- 7. Health check endpoint ---
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    baseUrl: baseUrl
  });
});

// --- 8. Start server ---
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`IdP running on port ${port}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Metadata: ${baseUrl}/metadata`);
  console.log(`SSO: ${baseUrl}/sso`);
  console.log(`Health: ${baseUrl}/health`);
});
