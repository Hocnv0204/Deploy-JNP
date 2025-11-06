package lmh.webrtc.service.impl;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import lmh.webrtc.service.JWTTokenService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.Map;

@Service
public class JWTTokenServiceImpl implements JWTTokenService {

    @Value("${security.jwt.secret:your-256-bit-secret-your-256-bit-secret}")
    private String secret;

    @Value("${security.jwt.access-exp-seconds:3600}")
    private long accessExpSeconds;

    @Value("${security.jwt.refresh-exp-seconds:604800}")
    private long refreshExpSeconds;

    private SecretKey getSigningKey() {
        byte[] keyBytes = secret.getBytes();
        // If configured as Base64, we could use Decoders.BASE64.decode(secret)
        return Keys.hmacShaKeyFor(keyBytes);
    }

    @Override
    public String generateAccessToken(UserDetails userDetails, Map<String, Object> claims) {
        Instant now = Instant.now();
        Instant exp = now.plusSeconds(accessExpSeconds);
        return Jwts.builder()
                .claims(claims)
                .subject(userDetails.getUsername())
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(getSigningKey())
                .compact();
    }

    @Override
    public String generateRefreshToken(UserDetails userDetails, Map<String, Object> claims) {
        Instant now = Instant.now();
        Instant exp = now.plusSeconds(refreshExpSeconds);
        return Jwts.builder()
                .claims(claims)
                .subject(userDetails.getUsername())
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(getSigningKey())
                .compact();
    }

    private Claims decode(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    @Override
    public String extractUsername(String token) {
        return decode(token).getSubject();
    }

    @Override
    public boolean validateToken(String token, UserDetails userDetails) {
        String username = extractUsername(token);
        return username.equals(userDetails.getUsername()) && !isTokenExpired(token);
    }

    @Override
    public boolean isTokenExpired(String token) {
        return decode(token).getExpiration().before(new Date());
    }
}


