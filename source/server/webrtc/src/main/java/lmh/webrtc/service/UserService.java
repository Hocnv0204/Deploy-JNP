package lmh.webrtc.service;

import lmh.webrtc.model.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

public interface UserService extends UserDetailsService {
    User createUser(String username, String rawPassword);
    User findByUsernameOrThrow(String username);
    UserDetails loadUserByUsername(String username);
}


