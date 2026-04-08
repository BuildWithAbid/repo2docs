package main

import "net/http"

type HealthService struct{}

func StartServer() {}

func health(w http.ResponseWriter, r *http.Request) {}

func main() {
	http.HandleFunc("/health", health)
}
