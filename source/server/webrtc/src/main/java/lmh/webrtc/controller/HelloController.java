package lmh.webrtc.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequiredArgsConstructor
public class HelloController {
    @GetMapping("/hello")
    public String testServer() {
        return "Hello world";
    }
}
