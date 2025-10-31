<script>
  import "../app.css";
  let theme = "light";

  function toggleTheme() {
	theme = theme === "light" ? "dark" : "light";
	document.documentElement.setAttribute("data-theme", theme);
  }
</script>

<div class="min-h-screen bg-base-200 flex flex-col" data-theme={theme}>
 
 
 

  <!-- Main Content -->
  <main class="flex-1 container mx-auto p-6">
	<slot />
  </main>

  <!-- Footer -->
  <footer class="footer footer-center p-4 bg-base-300 text-base-content mt-auto">
	<aside>
	  <p>
		© {new Date().getFullYear()} Grampian Flyers • Built by
		<a
		  href="https://boundary.co"
		  class="font-semibold text-primary hover:underline"
		  target="_blank"
		  >Boundary</a
		>
	  </p>
	</aside>
  </footer>
</div>
