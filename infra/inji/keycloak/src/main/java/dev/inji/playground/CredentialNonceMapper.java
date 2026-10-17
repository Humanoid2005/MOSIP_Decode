package dev.inji.playground;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import org.keycloak.jose.jws.JWSInput;
import org.keycloak.models.ClientSessionContext;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.ProtocolMapperModel;
import org.keycloak.models.UserSessionModel;
import org.keycloak.protocol.oidc.mappers.AbstractOIDCProtocolMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAccessTokenMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAccessTokenResponseMapper;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.representations.AccessToken;
import org.keycloak.representations.AccessTokenResponse;

public final class CredentialNonceMapper extends AbstractOIDCProtocolMapper
        implements OIDCAccessTokenMapper, OIDCAccessTokenResponseMapper {
    private static final SecureRandom RANDOM = new SecureRandom();

    @Override public String getId() { return "inji-credential-nonce"; }
    @Override public String getDisplayType() { return "Inji credential nonce"; }
    @Override public String getDisplayCategory() { return TOKEN_MAPPER_CATEGORY; }
    @Override public String getHelpText() { return "Binds a fresh credential proof nonce to the signed access token and token response."; }
    @Override public List<ProviderConfigProperty> getConfigProperties() { return List.of(); }

    @Override
    public AccessToken transformAccessToken(AccessToken token, ProtocolMapperModel model,
            KeycloakSession session, UserSessionModel user, ClientSessionContext context) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        token.setOtherClaims("c_nonce", Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
        token.setOtherClaims("c_nonce_expires_in", 300);
        return token;
    }

    @Override
    public AccessTokenResponse transformAccessTokenResponse(AccessTokenResponse response,
            ProtocolMapperModel model, KeycloakSession session, UserSessionModel user,
            ClientSessionContext context) {
        try {
            // Read the token just signed by Keycloak so concurrent grants cannot share a nonce.
            AccessToken token = new JWSInput(response.getToken()).readJsonContent(AccessToken.class);
            Object nonce = token.getOtherClaims().get("c_nonce");
            if (nonce == null) throw new IllegalStateException("Credential nonce missing from access token");
            response.setOtherClaims("c_nonce", nonce);
            response.setOtherClaims("c_nonce_expires_in", token.getOtherClaims().get("c_nonce_expires_in"));
            return response;
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot bind credential nonce to token response", exception);
        }
    }
}
