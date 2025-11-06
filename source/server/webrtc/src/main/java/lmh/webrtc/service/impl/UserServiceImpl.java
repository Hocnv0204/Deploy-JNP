package lmh.webrtc.service.impl;

import lmh.webrtc.model.Role;
import lmh.webrtc.model.User;
import lmh.webrtc.repository.UserRepository;
import lmh.webrtc.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public User createUser(String username, String rawPassword) {
        if (userRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("Username already exists");
        }
        User user = User.builder()
                .username(username)
                .password(passwordEncoder.encode(rawPassword))
                .role(Role.ROLE_USER)
                .build();
        return userRepository.save(user);
    }

    @Override
    public User findByUsernameOrThrow(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return findByUsernameOrThrow(username);
    }
}


