<script type="ts">
	import { Contract, ethers } from "ethers";
  import { erc721 } from "../utils/erc721";

	// Variables:
	let address = "";
  let pferPromises: Promise<{ metadata: any, image: string }>[] = [];
  let runLog = "";
  let gifURI = "";
	
	// Functions:
  const log = (msg: string) => {
    runLog += `${msg}\n`;
  };

  const error = (msg: string) => {
    runLog += `<span style='color:red;'>${msg}</span>\n`;
  };

	const generateGIF = async () => {
    runLog = "";
    gifURI = "";
    pferPromises = [];
    try {
      if(!address) return error("Please reload the page and enter an address before generating.");

      // Get pfer list:
      log("Fetching your pfers...");
      pferPromises = (await pfers()).map(x => x.data());
      log(`${pferPromises.length} pfers found!\n`);

      // Wait for all to be resolved:
      log("Resolving pfer data...");
      const res = await Promise.all(pferPromises);
      res.sort((a,b) => {
        return a.metadata.attributes.filter((x: any) => x.trait_type === "Background")[0].value < 
          b.metadata.attributes.filter((x: any) => x.trait_type === "Background")[0].value ? 
          -1 : 1;
      });
      log("Resolved all pfer data successfully!\n");

      // Create image elements:
      log("Fetching pfer images...");
      const images = res.map(x => { const image = new Image(); image.src = x.image; return image; });
      await Promise.all(images.map(x => new Promise((resolve) => {
        x.onload = () => {
          setTimeout(resolve, 0);
        };
      })));
      log("Fetched all pfer images!\n");

      // Create GIF:
      log("Creating your personalized GIF. This may take a while...");
      var gif = new GIF({
        workers: 2,
        quality: 10,
        width: 1200,
        height: 1200
      });
      
      // Add image elements:
      for(let i = 0; i < images.length; i++) {
        gif.addFrame(images[i], { delay: 100 });
      }
      
      // Render:
      gif.on('finished', function(blob: any) {
        gifURI = URL.createObjectURL(blob);
        runLog = "";
      });
      gif.render();

    } catch(err) {
      console.error(err);
      error("Failed to generate GIF... Please check the logs or reload the page and retry.");
    }
	};

	const pfers = async(): Promise<{ data: () => Promise<{ metadata: any, image: string }>, category: string }[]> => {
    const nftContracts: Record<string, { contract: string, category: string, unique?: boolean }> = {
      pfer: {
        contract: "0xBCC664B1E6848caba2Eb2f3dE6e21F81b9276dD8",
        category: "pfer",
        unique: true
      }
    };
    const avatarPromises: { data: () => Promise<{ metadata: any, image: string }>, category: string }[] = [];
    const promises: Promise<any>[] = [];
    for(const key in nftContracts) {
      promises.push((async () => {
        const contract = new Contract(nftContracts[key].contract, erc721, new ethers.providers.JsonRpcProvider("https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", 1));
        const addToken = (tokenId: ethers.BigNumberish) => {
          avatarPromises.push({ data: () => (async () => {
            const tokenURI = await contract.tokenURI(tokenId);
            const metadata = await (await fetch("/ipfs/" + tokenURI.slice(7))).json();
            const url = "/ipfs/" + metadata.image.slice(7);
            return { metadata, image: url };
          })(), category: nftContracts[key].category });
        };
        const balance = await contract.balanceOf(address);
        if(balance > 0) {
          if(nftContracts[key].unique) {
            const tokenInFilter = contract.filters.Transfer(null, address);
            const tokenOutFilter = contract.filters.Transfer(address, null);
            const tokenInEvents = await contract.queryFilter(tokenInFilter);
            const tokenOutEvents = await contract.queryFilter(tokenOutFilter);
            const sequentialTransfers = tokenInEvents.concat(tokenOutEvents);
            if(sequentialTransfers.length > 1) {
              sequentialTransfers.sort((a,b) => a.blockNumber - b.blockNumber);
            }
            const tokenIds = new Set<string>();
            const lowerCaseAddress = address.toLowerCase();
            for(let i = 0; i < sequentialTransfers.length; i++) {
              const event = sequentialTransfers[i];
              if(event.args && event.args["tokenId"] && event.args["to"] && event.args["from"]) {
                const tokenId = ethers.BigNumber.from(event.args["tokenId"]).toHexString();
                if(event.args["to"].toLowerCase() === lowerCaseAddress)
                  tokenIds.add(tokenId);
                else if(event.args["from"].toLowerCase() === lowerCaseAddress)
                  tokenIds.delete(tokenId);
              }
            }
            for(const tokenId of tokenIds) {
              addToken(ethers.BigNumber.from(tokenId));
            }
          } else {
            addToken(0);
          }
        }
      })());
    }
    await Promise.allSettled(promises).catch(console.error);
    return avatarPromises;
  };

</script>

<!-- Title -->
<h1>GIF your pfers</h1>

<!-- Inputs -->
<div id="inputs">
	<input type="text" placeholder="Address (0x0...)" bind:value={address}>
	<button on:click={generateGIF}>GIF My Flock!</button>
</div>

<!-- GIF -->
{#if gifURI}
  <img id="gif" src={gifURI} alt="">
  <a href={gifURI} download="pgifer - {address}.gif">Download GIF</a>
{/if}

<!-- Loaded pfers -->
<div id="pfers">
  {#each pferPromises as pferPromise }
    <div class="pfer icofont-">
      {#await pferPromise}
        <!-- nothing -->
      {:then { image }}
        <img src={image} alt="">
      {/await}
    </div>
  {/each}
</div>

<!-- Log -->
{#if runLog}
  <div id="overlay">
    <div class="logs">{@html runLog}</div>
  </div>
{/if}

<!-- Style -->
<style>
	#inputs {
		display: flex;
		justify-content: flex-start;
		align-items: center;
		gap: 1rem;
	}

	#inputs > input[type="text"],
	#inputs > button {
		padding: 1rem 1rem;
		border-radius: 1rem;
		border: 1px solid currentColor;
	}

	button {
		cursor: pointer;
	}

  #gif {
    display: block;
    width: 256px;
    height: 256px;
    border-radius: 16px;
    margin-top: 1rem;
  }

	#pfers {
		display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
	}

  .pfer, .pfer > img {
    position: relative;
    display: block;
    width: 48px;
    height: 48px;
    border-radius: 8px;
  }

  .pfer > img {
    z-index: 1;
  }

  .pfer::before {
    content: "\eff5";
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 24px;
    animation-name: spin;
    animation-duration: 2s;
    animation-iteration-count: infinite;
    animation-play-state: running;
    animation-timing-function: linear;
  }

  #overlay {
    position: fixed;
    inset: 0;
    z-index: 2;
    background-color: #0008;
    color: white;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  #overlay > .logs {
    padding: 1rem;
    width: 600px;
    max-width: 90vw;
    height: 600px;
    max-height: 90%;
    white-space: pre-wrap;
    overflow-y: auto;
    border-radius: 1rem;
    background-color: #000c;
  }
</style>