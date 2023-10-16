use std::io::{self, BufRead};

fn main() {
    let stdin = io::stdin();
    let mut num_lines = 0;
    for _ in stdin.lock().lines() {
        num_lines += 1;
    }
    println!("Found this many lines: {}", num_lines);
}
