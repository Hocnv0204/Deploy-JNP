package lmh.webrtc.service;

import org.springframework.security.core.userdetails.UserDetails;

import java.util.Map;

public interface JWTTokenService {
    String generateAccessToken(UserDetails userDetails, Map<String, Object> claims);
    String generateRefreshToken(UserDetails userDetails, Map<String, Object> claims);
    String extractUsername(String token);
    boolean validateToken(String token, UserDetails userDetails);
    boolean isTokenExpired(String token);
}


