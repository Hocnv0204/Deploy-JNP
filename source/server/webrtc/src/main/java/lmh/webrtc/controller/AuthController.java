package lmh.webrtc.controller;

import jakarta.validation.Valid;
import lmh.webrtc.dto.auth.AuthRequest;
import lmh.webrtc.dto.auth.AuthResponse;
import lmh.webrtc.dto.auth.RegisterUserRequest;
import lmh.webrtc.model.User;
import lmh.webrtc.service.JWTTokenService;
import lmh.webrtc.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;

@RestController
@RequiredArgsConstructor
public class AuthController {

    private final UserService userService;
    private final JWTTokenService jwtTokenService;
    private final AuthenticationManager authenticationManager;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterUserRequest request) {
        User user = userService.createUser(request.getUsername(), request.getPassword());
        String access = jwtTokenService.generateAccessToken(user, new HashMap<>());
        String refresh = jwtTokenService.generateRefreshToken(user, new HashMap<>());
        return ResponseEntity.ok(new AuthResponse(access, refresh));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody AuthRequest request) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (BadCredentialsException e) {
            return ResponseEntity.status(401).build();
        }
        UserDetails user = userService.loadUserByUsername(request.getUsername());
        String access = jwtTokenService.generateAccessToken(user, new HashMap<>());
        String refresh = jwtTokenService.generateRefreshToken(user, new HashMap<>());
        return ResponseEntity.ok(new AuthResponse(access, refresh));
    }
}


